/**
 * MyPubMed: main.js — Version: Version: v00.003.034-alpha

 ------------------------------------------------------------------------------
* Author: Alan D. Keizer
 * © 2025 Alan D. Keizer. All rights reserved.
 *
 * Description:
 * Handles PubMed API interactions, metadata parsing, local caching, UI updates,
 * and debug output. Includes XML parsing and fallback proxy handling.

 * Change Log:
 * - Improved article rendering layout and spacing
 * - Debug log content now updates with cleaner formatting
 * - Search button changes color to indicate active searching
 * - Cursor changes to "wait" while search is active
 * - Input field Enter key press now more robust
 * - DOI and Journal fields now become clickable links
 * - README toggle restored with improved behavior
 * - Improved error handling and logging in search flow
 * - Added initial scaffolding for future metadata extensions
 */

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("searchInput");

  // Bind Enter key to trigger search
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchPubMed();
  });
});

/** Toggle visibility of README table */
function toggleReadme() {
  const readme = document.getElementById("readme");
  readme.style.display = readme.style.display === "none" ? "block" : "none";
}

/** Main search function using E-Utilities */
function searchPubMed() {
  const query = document.getElementById("searchInput").value.trim();
  const filterStrict = document.getElementById("filterStrict").checked;
  const fallbackPlain = document.getElementById("fallbackPlain").checked;
  const debugPanel = document.getElementById("debugPanel").querySelector("pre");
  const searchBtn = document.getElementById("searchButton");

  if (!query) {
    alert("Please enter a search term.");
    return;
  }

  document.body.style.cursor = "wait";
  searchBtn.style.backgroundColor = "#3C3B6E";
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

        debugPanel.textContent += `\n> Fetching: ${id} (${useFallback ? "fallback" : "xml"})`;

        return fetch(url)
          .then((res) => res.text())
          .then((text) => parseArticleData(text, id, useFallback))
          .catch(() => {
            debugPanel.textContent += `\n> Error fetching ${id}: Load failed`;
            return null;
          });
      });

      Promise.all(fetches).then((articles) => {
        const filtered = useStrict
          ? articles.filter((a) => a && a.metadataScore >= 5)
          : articles.filter(Boolean);

        renderResults(filtered);
        document.getElementById("results-count").textContent = `Articles Found: ${filtered.length}`;
        searchBtn.style.backgroundColor = "#B22234";
        document.body.style.cursor = "default";
      });
    })
    .catch((err) => {
      debugPanel.textContent += `\n> Search failed: ${err}`;
      document.getElementById("results").textContent = "Search failed.";
      searchBtn.style.backgroundColor = "#B22234";
      document.body.style.cursor = "default";
    });
}

/** Extract relevant metadata from XML or plain text response */
function parseArticleData(text, pmid, isFallback) {
  let title = "", abstract = "", authors = "", pubDate = "", journal = "", doi = "", metadataScore = 0;
  let fullTextUrl = "", pmcid = "";

  if (isFallback) {
    return null; // skip fallback in this version until worker is stable
  }

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
  pmcid = getVal("ArticleId[IdType=pmc]");
  authors = Array.from(xml.querySelectorAll("AuthorList Author"))
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

  return {
    pmid,
    title,
    abstract,
    authors,
    journal,
    pubDate,
    doi,
    pmcid,
    metadataScore,
  };
}

/** Render article list to DOM */
function renderResults(articles) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  articles.forEach((article) => {
    const div = document.createElement("div");
    div.className = "result";

    const doiLink = article.doi ? `<a href="https://doi.org/${article.doi}" target="_blank">${article.doi}</a>` : "N/A";

    div.innerHTML = `
      <div class="label">Title:</div> ${article.title}
      <div class="label">Authors:</div> ${article.authors}
      <div class="label">PMID:</div> ${article.pmid}
      <div class="label">DOI:</div> ${doiLink}
      <div class="label">Abstract:</div><div>${article.abstract || "(No abstract provided)"}</div>
      <div class="label">Journal:</div> ${article.journal}
      <div class="label">Publication Date:</div> ${article.pubDate}
      <div class="label">Metadata Score:</div> ${article.metadataScore}/5
      <div><a href="https://pubmed.ncbi.nlm.nih.gov/${article.pmid}" target="_blank">View on PubMed</a></div>
      <button class="save-button" onclick="saveArticle('${article.pmid}')">Save Article</button>
      <button class="save-button" onclick="toggleAttributes(this)">Show Attributes</button>
      <div class="attributes-toggle"><pre>${JSON.stringify(article, null, 2)}</pre></div>
    `;

    resultsDiv.appendChild(div);
  });
}

/** Expand/collapse the JSON block */
function toggleAttributes(button) {
  const panel = button.nextElementSibling;
  const visible = panel.style.display === "block";
  panel.style.display = visible ? "none" : "block";
  button.textContent = visible ? "Show Attributes" : "Hide Attributes";
  button.style.backgroundColor = visible ? "transparent" : "#3C3B6E";
  button.style.color = visible ? "#B22234" : "#fff";
}

/** Save article PMID to localStorage */
function saveArticle(pmid) {
  const results = JSON.parse(localStorage.getItem("savedArticles") || "[]");
  if (!results.includes(pmid)) {
    results.push(pmid);
    localStorage.setItem("savedArticles", JSON.stringify(results));
    alert(`Article ${pmid} saved.`);
  } else {
    alert(`Article ${pmid} is already saved.`);
  }
}

/** Load and display saved articles from localStorage */
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
    renderResults(articles.filter(Boolean));
  });
}