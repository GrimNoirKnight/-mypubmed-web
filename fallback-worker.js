/*
  fallback-worker.js - For MyPubMed.com
  
  Author: Alan D. Keizer
  © 2025 Alan D. Keizer. All rights reserved.

  Description:
  This Cloudflare Worker acts as a proxy fallback to bypass browser CORS
  restrictions when accessing raw PubMed metadata using the /?format=pubmed endpoint.

  Version: 00.003.031-alpha

  Change Log:
   - 2025-04-03: Confirmed consistent CORS headers across all responses
   - 2025-04-03: Standardized error handling message formatting
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

      const body = await response.text();

      return new Response(body, {
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