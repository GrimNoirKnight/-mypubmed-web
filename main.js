/**
 * main.js — Core Logic for MyPubMed.com
 * 
 * Author: Alan D. Keizer
 * © 2025 Alan D. Keizer. All rights reserved.
 *
 * Description:
 * Handles all PubMed API interactions, article parsing, metadata scoring,
 * localStorage caching, and UI interactivity. Includes support for
 * Cloudflare fallback proxy when direct fetch is blocked.
 *
 * Version: 00.003.030-alpha
 *
 * Change Log:
 *  - 2025-04-03: Patch for fallback-mode rendering (was displaying undefined/0)
 *  - 2025-04-03: Footer versionTag ID added to update version number dynamically
 */


(() => {
  const VERSION = '00.003.030-alpha';

  document.addEventListener("DOMContentLoaded", () => {
    const tag = document.getElementById("versionTag");
    if (tag) tag.textContent = `v${VERSION}`;
  });

  async function searchPubMed() {
    const query = document.getElementById("searchInput").value.trim();
    const requireAll = document.getElementById("filterStrict")?.checked;
    const useFallback = document.getElementById("fallbackPlain")?.checked;
    if (!query) return;

    logDebug(`> Searching PubMed for: ${query}`);

    const results = [];
    try {
      const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=40`);
      const json = await res.json();
      const ids = json.esearchresult.idlist;
      logDebug(`> Found ${ids.length} IDs`);

      for (const pmid of ids) {
        try {
          let article = useFallback
            ? await fetchFallback(pmid)
            : await fetchAndParseXML(pmid);
          if (!article) continue;

          article.score = scoreMetadata(article);
          if (!requireAll || article.score === 5) results.push(article);
        } catch (err) {
          logDebug(`> Error fetching ${pmid}: ${err.message}`);
        }
      }

      displayResults(results);
    } catch (err) {
      logDebug(`[ERROR] ${err.message}`);
    }
  }

  async function fetchAndParseXML(pmid) {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
    const xml = await fetch(url).then(r => r.text());
    return parseXML(xml);
  }

  async function fetchFallback(pmid) {
    const url = `https://steep-wind-e765.mymsfzkxqq.workers.dev/?pmid=${pmid}`;
    const txt = await fetch(url).then(r => r.text());

    const title = txt.match(/^TI\s+-\s+(.*)$/m)?.[1];
    const journal = txt.match(/^JT\s+-\s+(.*)$/m)?.[1];
    const date = txt.match(/^DP\s+-\s+(.*)$/m)?.[1];
    const pmidMatch = txt.match(/^PMID-\s+(.*)$/m);
    const authors = (txt.match(/^FAU\s+-\s+(.*)$/gm) || []).map(line => line.replace("FAU - ", "")).join(", ");

    return {
      pmid: pmidMatch?.[1],
      title,
      journal,
      pubDate: date,
      authors,
    };
  }

  function parseXML(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const get = (selector) => doc.querySelector(selector)?.textContent || "";
    const authors = Array.from(doc.querySelectorAll("Author")).map(a => {
      const f = a.querySelector("ForeName")?.textContent || "";
      const l = a.querySelector("LastName")?.textContent || "";
      return `${f} ${l}`.trim();
    }).join(", ");
    return {
      pmid: get("PMID"),
      title: get("ArticleTitle"),
      authors,
      journal: get("Journal > Title"),
      pubDate: get("PubDate"),
    };
  }

  function scoreMetadata(article) {
    const fields = ['pmid', 'title', 'authors', 'journal', 'pubDate'];
    return fields.reduce((s, k) => s + (article[k] ? 1 : 0), 0);
  }

  function displayResults(results) {
    const out = document.getElementById("results");
    const count = document.getElementById("results-count");
    count.textContent = `Articles Found: ${results.length}`;
    out.innerHTML = "";

    for (const a of results) {
      const div = document.createElement("div");
      div.className = "result";
      div.innerHTML = `
        <p class="label">Title:</p><p>${a.title || "—"}</p>
        <p class="label">Authors:</p><p>${a.authors || "—"}</p>
        <p class="label">Journal:</p><p>${a.journal || "—"} (${a.pubDate || "—"})</p>
        <p class="label">Metadata Score:</p><p>${a.score}/5</p>
        <p><a href="https://pubmed.ncbi.nlm.nih.gov/${a.pmid}" target="_blank">View on PubMed</a></p>
        <button class="save-button" onclick="saveArticle('${a.pmid}')">Save Article</button>
      `;
      out.appendChild(div);
    }

    if (results.length === 0) {
      out.innerHTML = "<p>No articles matched.</p>";
    }
  }

  function logDebug(msg) {
    const box = document.getElementById("debugPanel").querySelector("pre");
    box.textContent += `\n${msg}`;
  }

  window.searchPubMed = searchPubMed;
  window.toggleReadme = () => {
    const r = document.getElementById("readme");
    r.style.display = r.style.display === "none" ? "block" : "none";
  };
  window.showSavedArticles = () => {
    const saved = JSON.parse(localStorage.getItem("savedArticles") || "[]");
    displayResults(saved);
    logDebug(`> Showing ${saved.length} saved articles`);
  };
  window.saveArticle = async (pmid) => {
    const xml = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`).then(r => r.text());
    const article = parseXML(xml);
    const saved = JSON.parse(localStorage.getItem("savedArticles") || "[]");
    saved.push(article);
    localStorage.setItem("savedArticles", JSON.stringify(saved));
    logDebug(`> Saved article ${pmid}`);
  };
})();