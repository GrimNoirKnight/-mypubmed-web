// main.js
// v00.003.026-alpha
// JavaScript logic for MyPubMed Research Assistant (modular version)

// Global debug log array
const debugLog = [];

// Append message to the debug log panel
function logDebug(msg) {
  debugLog.push(msg);
  const panel = document.getElementById("debug-log");
  if (panel) {
    panel.style.display = "block";
    panel.innerHTML = debugLog.join("\n");
  }
}

// Format ISO date to readable format
function formatDate(date) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Retrieve saved articles from local storage
function getSavedArticles() {
  const saved = localStorage.getItem('savedArticles');
  return saved ? JSON.parse(saved) : {};
}

// Save an article by PMID to local storage
function saveArticle(pmid) {
  const saved = getSavedArticles();
  if (!saved[pmid]) {
    saved[pmid] = { dateSaved: new Date().toISOString() };
    localStorage.setItem('savedArticles', JSON.stringify(saved));
    searchPubMed(); // re-render with updated save status
  }
}

// Remove an article from saved list
function removeArticle(pmid) {
  const saved = getSavedArticles();
  if (saved[pmid]) {
    delete saved[pmid];
    localStorage.setItem('savedArticles', JSON.stringify(saved));

    const input = document.getElementById('searchInput');
    if (input.value) searchPubMed();
    else showSavedArticles();
  }
}

// Perform PubMed search using ESearch
async function searchPubMed() {
  const term = document.getElementById('searchInput').value.trim();
  const useFallback = document.getElementById('fallbackPlain').checked;
  const resultsDiv = document.getElementById('results');
  const resultsCount = document.getElementById('results-count');
  const savedArticles = getSavedArticles();

  resultsDiv.innerHTML = 'Searching...';
  resultsCount.textContent = '';
  document.getElementById("debug-log").innerHTML = '';
  debugLog.length = 0;

  logDebug(`> Searching PubMed for: ${term}`);

  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=100&term=${encodeURIComponent(term)}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const idList = searchData.esearchresult.idlist;

    if (idList.length === 0) {
      resultsDiv.innerHTML = 'No results found.';
      return;
    }

    logDebug(`> Found ${idList.length} IDs`);
    renderArticlesByIdList(idList, savedArticles, resultsDiv, resultsCount, useFallback);

  } catch (err) {
    logDebug(`> Search failed: ${err.message}`);
    resultsDiv.innerHTML = 'An error occurred while searching PubMed.';
  }
}

// Show saved articles
async function showSavedArticles() {
  const saved = getSavedArticles();
  const pmids = Object.keys(saved);
  const resultsDiv = document.getElementById('results');
  const resultsCount = document.getElementById('results-count');

  debugLog.length = 0;
  document.getElementById("debug-log").innerHTML = '';
  resultsDiv.innerHTML = 'Loading saved articles...';
  resultsCount.textContent = '';

  if (pmids.length === 0) {
    resultsDiv.innerHTML = 'No saved articles.';
    return;
  }

  logDebug(`> Loading saved articles (${pmids.length})`);
  renderArticlesByIdList(pmids, saved, resultsDiv, resultsCount, false);
}

// Render articles using either XML or plain-text fallback
async function renderArticlesByIdList(idList, savedArticles, resultsDiv, resultsCount, useFallback) {
  const strictMode = document.getElementById('filterStrict').checked;
  let html = '';
  let renderedCount = 0;

  for (let i = 0; i < idList.length; i++) {
    const pmid = idList[i];
    let article = null;

    try {
      if (useFallback) {
        logDebug(`> Fetching: ${pmid} (fallback)`);
        const res = await fetch(`https://pubmed.ncbi.nlm.nih.gov/${pmid}/?format=pubmed`);
        if (!res.ok) throw new Error("Fallback fetch failed");
        const text = await res.text();
        article = parsePlainTextMetadata(text, pmid);
      } else {
        logDebug(`> Fetching: ${pmid} (xml)`);
        const xmlUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
        const xmlRes = await fetch(xmlUrl);
        if (!xmlRes.ok) throw new Error("XML fetch failed");
        const xmlText = await xmlRes.text();
        article = parseXMLMetadata(xmlText);
      }
    } catch (err) {
      logDebug(`> ${useFallback ? 'Plain-text' : 'XML'} fetch error for ${pmid}: ${err.message}`);
      continue;
    }

    if (!article || Object.values(article).includes(undefined)) {
      logDebug(`> Error: Object.values requires that input parameter not be null or undefined`);
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

// Parse XML from EFetch
function parseXMLMetadata(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");
  const articleNode = xml.querySelector("PubmedArticle");

  const pmid = articleNode.querySelector("PMID")?.textContent;
  const title = articleNode.querySelector("ArticleTitle")?.textContent;
  const journal = articleNode.querySelector("Journal > Title")?.textContent;
  const pubDateNode = articleNode.querySelector("PubDate, DateCreated");
  const pubDate = pubDateNode?.textContent;

  const authors = [...articleNode.querySelectorAll("AuthorList > Author")]
    .map(a => {
      const last = a.querySelector("LastName")?.textContent || '';
      const initials = a.querySelector("Initials")?.textContent || '';
      return `${last} ${initials}`.trim();
    }).join(', ');

  return { pmid, title, authors, journal, pubDate };
}

// Parse plain-text metadata from fallback endpoint
function parsePlainTextMetadata(text, pmid) {
  const lines = text.split('\n');
  const meta = { pmid };

  lines.forEach(line => {
    if (line.startsWith("TI  -")) meta.title = line.replace("TI  -", "").trim();
    if (line.startsWith("AU  -")) {
      const name = line.replace("AU  -", "").trim();
      meta.authors = (meta.authors || '') + name + ', ';
    }
    if (line.startsWith("JT  -")) meta.journal = line.replace("JT  -", "").trim();
    if (line.startsWith("DP  -")) meta.pubDate = line.replace("DP  -", "").trim();
  });

  if (meta.authors) meta.authors = meta.authors.replace(/, $/, '');
  return meta;
}

// Toggle the readme viewer
function toggleReadme() {
  const readme = document.getElementById('readme');
  readme.style.display = readme.style.display === 'block' ? 'none' : 'block';
}

// Enable search on Enter key
document.getElementById('searchInput').addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchPubMed();
  }
});