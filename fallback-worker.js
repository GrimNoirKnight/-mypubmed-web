/*
  fallback-worker.js - For MyPubMed.com
  
  Author: Alan D. Keizer
  © 2025 Alan D. Keizer. All rights reserved.

  Version: 00.003.030-alpha

  Description:
  Cloudflare Worker to fetch PubMed's plain-text metadata (format=pubmed)
  for use as a browser fallback, bypassing CORS and browser blocks.

  Change Log:
  - v00.003.030-alpha: Minor header edits and stability
*/

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pmid = url.searchParams.get("pmid");

    if (!pmid) {
      return new Response("Missing PMID", {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "text/plain"
        }
      });
    }

    const target = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/?format=pubmed`;

    try {
      const response = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/plain"
        }
      });

      const text = await response.text();

      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (err) {
      return new Response("Fetch failed: " + err.message, {
        status: 502,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "text/plain"
        }
      });
    }
  }
}