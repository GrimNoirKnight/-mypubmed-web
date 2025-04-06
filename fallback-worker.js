/**
 * MyPubMed: fallback-worker.js - Version: v00.003.034-alpha
 ------------------------------------------------------------------------------
 * Author: Alan D. Keizer
 * © 2025 Alan D. Keizer. All rights reserved.
 *
 * Description:
 * Acts as a proxy fallback for MyPubMed, bypassing browser CORS restrictions
 * and fetching raw PubMed metadata via the NCBI website using the `?format=pubmed` endpoint.
 * Returns plain-text metadata when XML fetch fails.
 *
 * Change Log:
 * - Improved consistency of HTTP headers (CORS + Content-Type)
 * - Standardized error response structure
 * - Cleaned up fetch error handling for better logging
 * - Prep for future DOI or LID/PII link generation logic
 */


export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");

      const pmid = pathParts[pathParts.length - 1];

      if (!pmid || isNaN(pmid)) {
        return new Response("Invalid PMID.", {
          status: 400,
          headers: standardHeaders("text/plain"),
        });
      }

      const targetUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/?format=pubmed`;

      const pubmedRes = await fetch(targetUrl);

      if (!pubmedRes.ok) {
        return new Response(`Failed to fetch data for PMID ${pmid}`, {
          status: 502,
          headers: standardHeaders("text/plain"),
        });
      }

      const body = await pubmedRes.text();

      return new Response(body, {
        status: 200,
        headers: standardHeaders("text/plain"),
      });

    } catch (err) {
      return new Response(`Worker Error: ${err.message}`, {
        status: 500,
        headers: standardHeaders("text/plain"),
      });
    }
  }
};

/** Common response headers */
function standardHeaders(contentType) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  };
}