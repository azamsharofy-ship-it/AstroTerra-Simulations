export async function handler(event) {
  const base = "https://earthquake.usgs.gov";
  // Get the path after /usgs
  const apiPath = event.path.replace("/.netlify/functions/usgs", "");
  // Build the query string from parameters
  const query = new URLSearchParams(event.queryStringParameters).toString();
  const url = query ? `${base}${apiPath}?${query}` : `${base}${apiPath}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { statusCode: response.status, body: `Error: ${response.statusText}` };
    }
    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data),
      headers: { "Access-Control-Allow-Origin": "*" }
    };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
}
