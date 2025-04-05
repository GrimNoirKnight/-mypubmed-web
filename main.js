/**
 * main.js — Core Logic for MyPubMed
 *
 * Author: Alan D. Keizer
 * © 2025 Alan D. Keizer. All rights reserved.
 *
 * Description:
 * Handles all PubMed API interactions, article parsing, metadata scoring,
 * localStorage caching, and UI interactivity. Includes support for
 * Cloudflare fallback proxy when direct fetch is blocked.
 *
 * Version: 00.003.032-alpha
 *
 * Change Log:
 *  - Added full metadata rendering (PMID, DOI, etc.)
 *  - Added Show Attributes toggle for each article
 *  - Fixed fallback rendering for better readability
 *  - Fixed Save/View/Remove Article functions
 *  - Improved debug output
 */

(() => {
  const VERSION = '00.003.032-alpha';

  document.addEventListener("DOMContentLoaded", () => {
    const tag = document.getElementById("versionTag");
    if (tag) tag.textContent = `v${VERSION}`;
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
        try {
          let data;
          if (useFallback) {
            const proxyURL = `https://steep-wind-e765.mymsfzkxqq.workers.dev/?pmid=${pmid}`;
            data = await fetch(proxyURL).then(r => r.text());
            data = { pmid, abstract: data, fallback: true };
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

    const getText = (tag) => doc.querySelector(tag)?.textContent || "";

    const pmid = getText("PMID");
    const title = getText("ArticleTitle");
    const authors = Array.from(doc.querySelectorAll("Author"))
      .map(a => `${a.querySelector("ForeName")?.textContent || ""} ${a.querySelector("LastName")?.textContent || ""}`)
      .join(", ");
    const journal = getText("Journal > Title");
    const pubDate = getText("PubDate") || "";
    const abstract = getText("Abstract > AbstractText");

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

    if (articles.length === 0) {
      container.innerHTML = `<p>No articles matched.</p>`;
      return;
    }

    for (const article of articles) {
      const div = document.createElement("div");
      div.className = "result";

      const link = `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`;

      let metadataBlock = `
        <p class="label">Title:</p><p>${article.title || "(Unavailable)"}</p>
        <p class="label">Authors:</p><p>${article.authors || "(Unavailable)"}</p>
        <p class="label">PMID:</p><p>${article.pmid || "(Unavailable)"}</p>
        <p class="label">Abstract:</p><p>${article.abstract || "No abstract available."}</p>
        <p class="label">Journal:</p><p>${article.journal || "(Unavailable)"}</p>
        <p class="label">PubDate:</p><p>${article.pubDate || "(Unavailable)"}</p>
        <p class="label">Metadata Score:</p><p>${article.score}/5</p>
        <p><a href="${link}" target="_blank">View on PubMed</a></p>
        <button class="save-button" onclick="saveArticle('${article.pmid}')">Save Article</button>
        <button class="save-button" onclick="toggleAttributes('${article.pmid}')">Show Attributes</button>
        <div id="attributes-${article.pmid}" class="attributes-toggle">
          <pre>${JSON.stringify(article, null, 2)}</pre>
        </div>
      `;

      div.innerHTML = metadataBlock;
      container.appendChild(div);
    }
  }

  function toggleAttributes(pmid) {
    const el = document.getElementById(`attributes-${pmid}`);
    if (el) el.style.display = el.style.display === "block" ? "none" : "block";
  }

  function logDebug(msg) {
    const panel = document.getElementById("debugPanel").querySelector("pre");
    panel.textContent += `\n${msg}`;
  }

  window.searchPubMed = searchPubMed;

  window.toggleReadme = () => {
    const r = document.getElementById("readme");
    r.style.display = r.style.display === "none" ? "block" : "none";
  };

  window.showSavedArticles = () => {
    const saved = JSON.parse(localStorage.getItem("savedArticles") || "[]");
    displayResults(saved);
    logDebug(`> Loading saved articles (${saved.length})`);
  };

  window.saveArticle = async (pmid) => {
    try {
      const efetchURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
      const xml = await fetch(efetchURL).then(r => r.text());
      const article = parseXMLMetadata(xml);
      const saved = JSON.parse(localStorage.getItem("savedArticles") || "[]");
      const exists = saved.find(a => a.pmid === pmid);
      if (!exists) {
        saved.push(article);
        localStorage.setItem("savedArticles", JSON.stringify(saved));
        logDebug(`> Saved article ${pmid}`);
      } else {
        logDebug(`> Article ${pmid} already saved`);
      }
    } catch (e) {
      logDebug(`[ERROR] Could not save article ${pmid}: ${e.message}`);
    }
  };
})();