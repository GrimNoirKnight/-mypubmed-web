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
 * Version: 00.003.033-alpha
 *
 * Change Log:
 *  - Fixed Search button and Return key input trigger
 *  - Restored Show README toggle
 *  - Added basic fallback UI toggle for article attributes
 */

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("searchInput");
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      searchPubMed();
    }
  });
});

function toggleReadme() {
  const readme = document.getElementById("readme");
  readme.style.display = readme.style.display === "none" ? "block" : "none";
}

function searchPubMed() {
  const query = document.getElementById("searchInput").value.trim();
  const filterStrict = document.getElementById("filterStrict").checked;
  const fallbackPlain = document.getElementById("fallbackPlain").checked;
  const debugPanel = document.getElementById("debugPanel").querySelector("pre");

  if (!query) {
    alert("Please enter a search term.");
    return;
  }

  document.getElementById("results").innerHTML = "Searching...";
  debugPanel.textContent = `(standby... initializing)\n> Searching PubMed for: ${query}`;

  const useFallback = fallbackPlain;
  const useStrict = filterStrict;

  fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(query)}`)
    .then((response) => response.json())
    .then((data) => {
      const ids = data.esearchresult.idlist;
      debugPanel.textContent += `\n> Found ${ids.length} IDs`;

      const fetches = ids.map((id) => {
        const url = useFallback
          ? `https://mypubmed.cloudflare.workers.dev/${id}`
          : `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${id}&retmode=xml`;

        const mode = useFallback ? "fallback" : "xml";
        debugPanel.textContent += `\n> Fetching: ${id} (${mode})`;

        return fetch(url)
          .then((res) => res.text())
          .then((text) => parseArticleData(text, id, useFallback))
          .catch((err) => {
            debugPanel.textContent += `\n> Error fetching ${id}: Load failed`;
            return null;
          });
      });

      Promise.all(fetches).then((articles) => {
        const filtered = useStrict
          ? articles.filter((a) => a && a.metadataScore >= 5)
          : articles.filter((a) => a);

        renderResults(filtered);
        document.getElementById("results-count").textContent = `Articles Found: ${filtered.length}`;
      });
    })
    .catch((err) => {
      debugPanel.textContent += `\n> Search failed: ${err}`;
      document.getElementById("results").textContent = "Search failed.";
    });
}

function parseArticleData(text, pmid, isFallback) {
  let title = "", abstract = "", authors = "", pubDate = "", journal = "", doi = "", metadataScore = 0;

  if (isFallback) {
    title = "Fetched via fallback";
    abstract = text;
    metadataScore = 2;
  } else {
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");

    const getVal = (tag) => {
      const el = xml.querySelector(tag);
      return el ? el.textContent.trim() : "";
    };

    title = getVal("ArticleTitle");
    abstract = getVal("Abstract AbstractText");
    journal = getVal("Journal Title");
    pubDate = getVal("PubDate Year") || getVal("PubDate MedlineDate");
    doi = getVal("ArticleId[IdType=doi]");

    const authorNodes = Array.from(xml.querySelectorAll("AuthorList Author"));
    authors = authorNodes
      .map((author) => {
        const last = author.querySelector("LastName")?.textContent || "";
        const fore = author.querySelector("ForeName")?.textContent || "";
        return `${fore} ${last}`.trim();
      })
      .join(", ");

    metadataScore += title ? 1 : 0;
    metadataScore += abstract ? 1 : 0;
    metadataScore += authors ? 1 : 0;
    metadataScore += journal ? 1 : 0;
    metadataScore += pubDate ? 1 : 0;
  }

  return {
    pmid,
    title,
    abstract,
    authors,
    journal,
    pubDate,
    doi,
    metadataScore,
  };
}

function renderResults(articles) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  articles.forEach((article) => {
    const div = document.createElement("div");
    div.className = "result";

    div.innerHTML = `
      <div><span class="label">Title:</span> ${article.title}</div>
      <div><span class="label">Authors:</span> ${article.authors}</div>
      <div><span class="label">PMID:</span> ${article.pmid}</div>
      <div><span class="label">DOI:</span> ${article.doi || "N/A"}</div>
      <div><span class="label">Abstract:</span><br>${article.abstract || "(No abstract provided)"}</div>
      <div><span class="label">Journal:</span> ${article.journal}</div>
      <div><span class="label">Publication Date:</span> ${article.pubDate}</div>
      <div><span class="label">Metadata Score:</span> ${article.metadataScore}/5</div>
      <div><a href="https://pubmed.ncbi.nlm.nih.gov/${article.pmid}" target="_blank">View on PubMed</a></div>
      <button class="save-button" onclick="saveArticle(${article.pmid})">Save Article</button>
      <button class="save-button" onclick="toggleAttributes(this)">Show Attributes</button>
      <div class="attributes-toggle">
        <pre>${JSON.stringify(article, null, 2)}</pre>
      </div>
    `;

    resultsDiv.appendChild(div);
  });
}

function toggleAttributes(button) {
  const panel = button.nextElementSibling;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function saveArticle(pmid) {
  const results = JSON.parse(localStorage.getItem("savedArticles") || "[]");
  if (!results.includes(pmid)) {
    results.push(pmid);
    localStorage.setItem("savedArticles", JSON.stringify(results));
    alert(`Article ${pmid} saved.`);
  }
}

function showSavedArticles() {
  const saved = JSON.parse(localStorage.getItem("savedArticles") || "[]");
  if (saved.length === 0) {
    document.getElementById("results").innerHTML = "No saved articles.";
    return;
  }

  document.getElementById("results").innerHTML = "Fetching saved articles...";

  const fetches = saved.map((pmid) =>
    fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`)
      .then((res) => res.text())
      .then((text) => parseArticleData(text, pmid, false))
      .catch(() => null)
  );

  Promise.all(fetches).then((articles) => {
    renderResults(articles.filter((a) => a));
  });
}