/**
 * main.js — Core Logic for MyPubMed.com
 *
 * Author: Alan D. Keizer
 * © 2025 Alan D. Keizer. All rights reserved.
 *
 * Description:
 * Handles all PubMed API interactions, article parsing, metadata scoring,
 * localStorage caching, and UI interactivity. Supports fallback proxy.
 *
 * Version: 00.003.031-alpha
 *
 * Change Log:
 *  - 2025-04-03: Restores full article data fields in display
 *  - 2025-04-03: Return key triggers search
 */

(() => {
  const VERSION = '00.003.031-alpha';

  document.addEventListener("DOMContentLoaded", () => {
    const tag = document.getElementById("versionTag");
    if (tag) tag.textContent = `v${VERSION}`;

    const input = document.getElementById("searchInput");
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        searchPubMed();
      }
    });
  });

  async function searchPubMed() {
    const query = document.getElementById("searchInput").value.trim();
    const requireAll = document.getElementById("filterStrict")?.checked;
    const useFallback = document.getElementById("fallbackPlain")?.checked;

    logDebug(`> Searching PubMed for: ${query}`);
    if (!query) return;

    try {
      const esearchURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=40`;
      const searchRes = await fetch(esearchURL).then(r => r.json());
      const idList = searchRes.esearchresult.idlist;

      logDebug(`> Found ${idList.length} IDs`);
      const results = [];

      for (const pmid of idList) {
        let data;
        try {
          if (useFallback) {
            const proxyURL = `https://steep-wind-e765.mymsfzkxqq.workers.dev/?pmid=${pmid}`;
            const text = await fetch(proxyURL).then(r => r.text());
            data = { pmid, title: "(fetched via fallback)", abstract: text, authors: "", journal: "", pubDate: "" };
            logDebug(`> Fetching: ${pmid} (fallback)`);
          } else {
            const efetchURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
            const xml = await fetch(efetchURL).then(r => r.text());
            data = parseXMLMetadata(xml);
            logDebug(`> Fetching: ${pmid} (xml)`);
          }

          if (data) {
            const score = scoreMetadata(data);
            if (!requireAll || score === 5) results.push({ ...data, score });
          }

        } catch (e) {
          logDebug(`> Error fetching ${pmid}: ${e.message}`);
        }
      }

      displayResults(results);
    } catch (e) {
      logDebug(`[ERROR] ${e.message}`);
    }
  }

  function parseXMLMetadata(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    const pmid = doc.querySelector("PMID")?.textContent;
    const title = doc.querySelector("ArticleTitle")?.textContent;
    const authors = Array.from(doc.querySelectorAll("Author")).map(a => {
      const last = a.querySelector("LastName")?.textContent;
      const fore = a.querySelector("ForeName")?.textContent;
      return `${fore} ${last}`;
    }).join(", ");
    const journal = doc.querySelector("Journal > Title")?.textContent;
    const pubDate = doc.querySelector("PubDate")?.textContent || "";
    const abstract = doc.querySelector("Abstract > AbstractText")?.textContent;

    return { pmid, title, authors, journal, pubDate, abstract };
  }

  function scoreMetadata(article) {
    const required = ['pmid', 'title', 'authors', 'journal', 'pubDate'];
    const missing = required.filter(k => !article[k]);
    return 5 - missing.length;
  }

  function displayResults(articles) {
    const container = document.getElementById("results");
    const count = document.getElementById("results-count");

    count.textContent = `Articles Found: ${articles.length}`;
    container.innerHTML = "";

    for (const article of articles) {
      const div = document.createElement("div");
      div.className = "result";
      div.innerHTML = `
        <p class="label">Title:</p><p>${article.title}</p>
        <p class="label">Abstract:</p><p>${article.abstract}</p>
        <p class="label">Authors:</p><p>${article.authors}</p>
        <p class="label">Journal:</p><p>${article.journal} (${article.pubDate})</p>
        <p class="label">PMID:</p><p>${article.pmid}</p>
        <p class="label">Metadata Score:</p><p>${article.score}/5</p>
        <p><a href="https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/" target="_blank">View on PubMed</a></p>
        <button class="save-button" onclick="saveArticle('${article.pmid}')">Save Article</button>
      `;
      container.appendChild(div);
    }
  }

  function logDebug(msg) {
    const panel = document.getElementById("debugPanel")?.querySelector("pre");
    if (panel) panel.textContent += `\n${msg}`;
  }

  window.searchPubMed = searchPubMed;

  window.toggleReadme = () => {
    const r = document.getElementById("readme");
    r.style.display = r.style.display === "none" ? "block" : "none";
  };

  window.showSavedArticles = () => {
    const saved = JSON.parse(localStorage.getItem("savedArticles") || "[]");
    displayResults(saved);
    logDebug(`> Loaded saved articles (${saved.length})`);
  };

  window.saveArticle = async (pmid) => {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
    const xml = await fetch(url).then(r => r.text());
    const article = parseXMLMetadata(xml);
    const saved = JSON.parse(localStorage.getItem("savedArticles") || "[]");
    saved.push(article);
    localStorage.setItem("savedArticles", JSON.stringify(saved));
    logDebug(`> Saved article ${pmid}`);
  