/**
 * fallback-worker.js - For MyPubMed
 *
 * Author: Alan D. Keizer
 * © 2025 Alan D. Keizer. All rights reserved.
 *
 * Description:
 * This Cloudflare Worker acts as a proxy fallback to bypass browser CORS
 * restrictions when accessing raw PubMed metadata using the /?format=pubmed endpoint.
 *
 * Version: 00.003.032-alpha
 *
 * Change Log:
 *  - Initial full implementation with CORS headers and PMID validation
 */

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/");
      const pmid = parts[parts.length - 1];

      if (!pmid || isNaN(pmid)) {
        return new Response("Invalid PMID.", {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/plain"
          }
        });
      }

      const targetUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/?format=pubmed`;
      const pubmedResponse = await fetch(targetUrl);

      if (!pubmedResponse.ok) {
        return new Response(`Failed to fetch data for PMID ${pmid}`, {
          status: 502,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/plain"
          }
        });
      }

      const body = await pubmedResponse.text();

      return new Response(body, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "text/plain"
        }
      });
    } catch (err) {
      return new Response(`Error: ${err.message}`, {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "text/plain"
        }
      });
    }
  }
};