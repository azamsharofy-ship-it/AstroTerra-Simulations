export async function handler(event) {
  const base = "https://ssd-api.jpl.nasa.gov/sbdb.api";
  const params = event.queryStringParameters;
  const query = new URLSearchParams(params).toString();
  const url = `${base}?${query}`;

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
