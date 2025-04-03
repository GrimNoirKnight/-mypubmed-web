/**
 * main.js — Core Logic for MyPubMedResearchAssistant.com
 *
 * Version: 00.003.029-alpha
 * Author: Alan D. Keizer
 * Copyright © 2025 A. D. Keizer. All rights reserved.
 *
 * Description:
 * Handles PubMed search, metadata parsing, scoring, saving, and UI updates.
 * Includes Cloudflare proxy fallback for plain-text fetches.
 *
 * Last Updated: 2025-04-02
 */

const VERSION = "00.003.029-alpha";
document.addEventListener("DOMContentLoaded", () => {
  log(`MyPubMedResearchAssistant ${VERSION} loaded.`);
  document.getElementById("versionTag").textContent = `v${VERSION}`;
});

const CLOUDFLARE_PROXY = "https://steep-wind-e765.mymsfzkxqq.workers.dev";

function log(message) {
  const logBox = document.getElementById("debugLog");
  if (logBox) {
    logBox.value += `\n> ${message}`;
    logBox.scrollTop = logBox.scrollHeight;
  }
  console.log(message);
}

async function searchPubMed() {
  log("Searching PubMed...");
  const query = document.getElementById("searchInput").value.trim();
  const requireAll = document.getElementById("requireAll").checked;
  const useFallback = document.getElementById("useFallback").checked;

  if (!query) return alert("Please enter a search term.");

  let ids = await getPubMedIds(query);
  log(`Found ${ids.length} IDs`);

  const articles = [];

  for (const id of ids) {
    let data = null;
    if (!useFallback) {
      data = await fetchXML(id);
    }
    if (!data && useFallback) {
      data = await fetchFallback(id);
    }
    if (data) {
      const parsed = parseArticle(data);
      if (!requireAll || (requireAll && parsed.metadataScore === 5)) {
        articles.push(parsed);
      }
    }
  }

  displayArticles(articles);
}

async function getPubMedIds(query) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.esearchresult.idlist;
}

async function fetchXML(pmid) {
  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${pmid}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("XML fetch failed");
    return await res.text();
  } catch (err) {
    log(`XML fetch error for ${pmid}: ${err.message}`);
    return null;
  }
}

async function fetchFallback(pmid) {
  try {
    const url = `${CLOUDFLARE_PROXY}/?pmid=${pmid}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fallback fetch failed");
    return await res.text();
  } catch (err) {
    log(`Fallback error for ${pmid}: ${err.message}`);
    return null;
  }
}

function parseArticle(data) {
  // Placeholder parsing logic — insert your real XML/Plain-text parser here
  return {
    pmid: "123456",
    title: "Placeholder Title",
    metadataScore: 5
  };
}

function displayArticles(articles) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  document.getElementById("articleCount").textContent = `Articles Found: ${articles.length}`;

  for (const article of articles) {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${article.title}</strong> (PMID: ${article.pmid})`;
    container.appendChild(div);
  }
}

function showSavedArticles() {
  log("Showing saved articles...");
  // Implementation goes here
}

function toggleReadme() {
  const readme = document.getElementById("readmeBox");
  if (!readme) return;
  readme.style.display = readme.style.display === "none" ? "block" : "none";
}