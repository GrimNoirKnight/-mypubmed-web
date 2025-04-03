// main.js — MyPubMedResearchAssistant v00.003.028-alpha
// Handles search, render, metadata parsing, localStorage, and logging.

const debugPanel = document.getElementById('debugPanel');
const fallbackCheck = document.getElementById('fallbackPlain');
const strictCheck = document.getElementById('filterStrict');
const resultsDiv = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const searchBox = document.getElementById('searchInput');
let debugLog = [];

function log(msg) {
  debugLog.push(msg);
  debugPanel.innerHTML = `<strong>Debug Log:</strong><br><pre>${debugLog.join('\n')}</pre>`;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getSavedArticles() {
  const saved = localStorage.getItem('savedArticles');
  return saved ? JSON.parse(saved) : {};
}

function saveArticle(pmid) {
  const saved = getSavedArticles();
  if (!saved[pmid]) {
    saved[pmid] = { dateSaved: new Date().toISOString() };
    localStorage.setItem('savedArticles', JSON.stringify(saved));
    searchPubMed();
  }
}

function removeArticle(pmid) {
  const saved = getSavedArticles();
  if (saved[pmid]) {
    delete saved[pmid];
    localStorage.setItem('savedArticles', JSON.stringify(saved));
    if (searchBox.value) searchPubMed();
    else showSavedArticles();
  }
}

async function searchPubMed() {
  const term = searchBox.value.trim();
  const useFallback = fallbackCheck.checked;
  debugLog = [];
  resultsDiv.innerHTML = 'Searching...';
  resultsCount.textContent = '';
  log(`> Searching PubMed for: ${term}`);

  if (!term) {
    resultsDiv.innerHTML = 'Please enter a search term.';
    return;
  }

  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=100&term=${encodeURIComponent(term)}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const idList = searchData.esearchresult.idlist;

    if (idList.length === 0) {
      resultsDiv.innerHTML = 'No results found.';
      return;
    }

    log(`> Found ${idList.length} IDs`);
    const savedArticles = getSavedArticles();
    renderArticlesByIdList(idList, savedArticles, useFallback);
  } catch (err) {
    log(`[ERROR] Failed to search: ${err.message}`);
    resultsDiv.innerHTML = 'Search failed. Check console.';
  }
}

async function showSavedArticles() {
  const saved = getSavedArticles();
  const pmids = Object.keys(saved);
  debugLog = [];
  resultsCount.textContent = '';
  if (pmids.length === 0) {
    resultsDiv.innerHTML = 'No saved articles.';
    return;
  }

  log(`> Loading saved articles (${pmids.length})`);
  resultsDiv.innerHTML = 'Loading saved articles...';
  renderArticlesByIdList(pmids, saved, false);
}

async function renderArticlesByIdList(idList, savedArticles, useFallback) {
  const strictMode = strictCheck.checked;
  let html = '';
  let renderedCount = 0;

  for (let i = 0; i < idList.length; i++) {
    const pmid = idList[i];
    let article = null;

    try {
      if (useFallback) {
        log(`> Fetching: ${pmid} (fallback)`);
        const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/?format=pubmed`;

        // CORS protection — warn if browser blocks fallback
        const res = await fetch(url);
        if (!res.ok || res.type === "opaque") throw new Error("Fallback blocked or failed");
        const text = await res.text();
        article = parsePlainTextMetadata(text, pmid);
      } else {
        log(`> Fetching: ${pmid} (xml)`);
        const xmlUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
        const xmlRes = await fetch(xmlUrl);
        if (!xmlRes.ok) throw new Error("XML fetch failed");
        const xmlText = await xmlRes.text();
        article = parseXMLMetadata(xmlText);
      }
    } catch (err) {
      log(`> ${useFallback ? "Plain-text" : "XML"} fetch error for ${pmid}: ${err.message}`);
      continue;
    }

    if (!article || Object.values(article).includes(undefined)) {
      log(`> Error: Some required fields missing for PMID ${pmid}`);
      continue;
    }

    const { title, authors, journal, pubDate } = article;
    const requiredFields = { pmid, title, authors, journal, pubDate };
    if (strictMode && Object.values(requiredFields).includes(undefined)) continue;

    const present = Object.values(article).filter(Boolean).length;
    const total = Object.keys(article).length;
    const scorePercent = Math.round((present / total) * 100);

    const dateSaved = savedArticles[pmid]?.dateSaved
      ? formatDate(new Date(savedArticles[pmid].dateSaved))
      : null;

    renderedCount++;
    html += `
      <div class="result">
        <h3>${renderedCount}. ${title}</h3>
        <p><strong>PMID:</strong> ${pmid}</p>
        <p><strong>Authors:</strong> ${authors}</p>
        <p><strong>Journal:</strong> ${journal}</p>
        <p><strong>Publication Date:</strong> ${pubDate}</p>
        <p><strong>Metadata Score:</strong> ${present}/${total} (${scorePercent}%)</p>
        <p><a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank">View on PubMed</a></p>
        <p><strong>Date Saved:</strong> ${
          dateSaved
            ? `${dateSaved} <button class="save-button" onclick="removeArticle('${pmid}')">Remove from Saved</button>`
            : `<button class="save-button" onclick="saveArticle('${pmid}')">Save Article</button>`
        }</p>
      </div>
    `;
  }

  resultsCount.textContent = `Articles Found: ${renderedCount}`;
  resultsDiv.innerHTML = html || 'No articles matched.';
}

function parseXMLMetadata(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");
  const articleNode = xml.querySelector("PubmedArticle");

  const pmid = articleNode?.querySelector("PMID")?.textContent;
  const title = articleNode?.querySelector("ArticleTitle")?.textContent;
  const journal = articleNode?.querySelector("Journal > Title")?.textContent;
  const pubDate = articleNode?.querySelector("PubDate, DateCreated")?.textContent;

  const authors = [...articleNode.querySelectorAll("AuthorList > Author")]
    .map(a => {
      const last = a.querySelector("LastName")?.textContent || '';
      const initials = a.querySelector("Initials")?.textContent || '';
      return `${last} ${initials}`.trim();
    }).join(', ');

  return { pmid, title, authors, journal, pubDate };
}

function parsePlainTextMetadata(text, pmid) {
  const lines = text.split('\n');
  const meta = { pmid };

  lines.forEach(line => {
    if (line.startsWith("TI  -")) meta.title = line.replace("TI  -", "").trim();
    if (line.startsWith("AU  -")) meta.authors = (meta.authors || "") + line.replace("AU  -", "").trim() + ', ';
    if (line.startsWith("JT  -")) meta.journal = line.replace("JT  -", "").trim();
    if (line.startsWith("DP  -")) meta.pubDate = line.replace("DP  -", "").trim();
  });

  if (meta.authors) meta.authors = meta.authors.replace(/, $/, '');
  return meta;
}

function toggleReadme() {
  const readme = document.getElementById('readme');
  readme.style.display = readme.style.display === 'block' ? 'none' : 'block';
}

searchBox.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchPubMed();
  }
});