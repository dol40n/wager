export interface SearchResult {
  title: string;
  url: string;
  content: string;
  published_date: string | null;
}

export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("[search] TAVILY_API_KEY not set, skipping web search");
    return [];
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!res.ok) {
      console.error(`[search] Tavily error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((r: Record<string, string>) => ({
      title: r.title || "",
      url: r.url || "",
      content: r.content || "",
      published_date: r.published_date || null,
    }));
  } catch (err) {
    console.error("[search] Web search failed:", err);
    return [];
  }
}
