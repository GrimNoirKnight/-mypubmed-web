/*
  fallback-worker.js - For MyPubMed.com
  
  Author: Alan D. Keizer
  © 2025 Alan D. Keizer. All rights reserved.

  Description:
  This Cloudflare Worker serves as a proxy fallback to bypass browser CORS
  restrictions when accessing raw PubMed metadata using the `/?format=pubmed` endpoint.
  The client can request this endpoint with a `?pmid=` parameter, and the worker
  will fetch the metadata from `https://pubmed.ncbi.nlm.nih.gov/PMID/?format=pubmed`.
  
  Version: 00.003.029-alpha
  
  Change Log:
  - Initial deployment of plain-text metadata proxy
  - Adds required CORS headers for browser access
  - Error handling for missing PMIDs and fetch failures
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