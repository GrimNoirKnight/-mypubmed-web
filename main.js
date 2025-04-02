// main.js — v00.003.027-alpha
//
//  Created by Alan D. Keizer
//  © 2025 Alan D. Keizer. All rights reserved.
//
// JavaScript logic for MyPubMed Research Assistant (modular version)
// 
// Refactored to include retry logic and temporarily disable fallback mode

const debugLog = [];

function logDebug(msg) {
  debugLog.push(msg);
  const panel = document.getElementById("debug-log");
  if (panel) {
    panel.style.display = "block";
    panel.innerHTML = "<strong>Debug Log:</strong><br><pre>" + debugLog.join("\n") + "</pre>";
  }
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

    const input = document.getElementById('searchInput');
    if (input.value) searchPubMed();
    else showSavedArticles();
  }
}

async function searchPubMed() {
  const term = document.getElementById('searchInput').value;
  const resultsDiv = document.getElementById('results');
  const resultsCount = document.getElementById('results-count');
  const debugPanel = document.getElementById('debug-log');

  resultsDiv.innerHTML = 'Searching...';
  resultsCount.textContent = '';
  debugPanel.innerHTML = '';
  debugLog.length = 0;

  const savedArticles = getSavedArticles();
  logDebug(`> Searching PubMed for: ${term}`);

  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=100&term=${encodeURIComponent(term)}`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();
  const idList = searchData.esearchresult.idlist;

  if (idList.length === 0) {
    resultsDiv.innerHTML = 'No results found.';
    return;
  }

  logDebug(`> Found ${idList.length} IDs`);
  renderArticlesByIdList(idList, savedArticles, resultsDiv, resultsCount);
}

async function showSavedArticles() {
  const saved = getSavedArticles();
  const pmids = Object.keys(saved);
  const resultsDiv = document.getElementById('results');
  const resultsCount = document.getElementById('results-count');
  const debugPanel = document.getElementById('debug-log');

  debugPanel.innerHTML = '';
  debugLog.length = 0;

  if (pmids.length === 0) {
    resultsDiv.innerHTML = 'No saved articles.';
    resultsCount.textContent = '';
    return;
  }

  logDebug(`> Loading saved articles (${pmids.length})`);
  resultsDiv.innerHTML = 'Loading saved articles...';
  renderArticlesByIdList(pmids, saved, resultsDiv, resultsCount);
}

async function fetchXMLWithRetry(pmid, maxRetries = 3) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logDebug(`> Fetching: ${pmid} (Attempt ${attempt})`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return parseXMLMetadata(text);
    } catch (err) {
      logDebug(`> Fetch error [${pmid}] on attempt ${attempt}: ${err.message}`);
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 500));
    }
  }

  logDebug(`> Failed after ${maxRetries} attempts for ${pmid}`);
  return null;
}

async function renderArticlesByIdList(idList, savedArticles, resultsDiv, resultsCount) {
  const strictMode = document.getElementById('filterStrict').checked;
  let html = '';
  let renderedCount = 0;

  for (let i = 0; i < idList.length; i++) {
    const pmid = idList[i];
    let article = await fetchXMLWithRetry(pmid);

    if (!article || Object.values(article).includes(undefined)) continue;

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
  const pubDateNode = articleNode?.querySelector("PubDate, DateCreated");
  const pubDate = pubDateNode?.textContent;

  const authors = [...articleNode.querySelectorAll("AuthorList > Author")]
    .map(a => {
      const last = a.querySelector("LastName")?.textContent || '';
      const initials = a.querySelector("Initials")?.textContent || '';
      return `${last} ${initials}`.trim();
    }).join(', ');

  return { pmid, title, authors, journal, pubDate };
}

function toggleReadme() {
  const readme = document.getElementById('readme');
  readme.style.display = readme.style.display === 'block' ? 'none' : 'block';
}

document.getElementById('searchInput').addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchPubMed();
  }
});