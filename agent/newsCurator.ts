import { GoogleGenAI, Type } from '@google/genai';

async function runAgentCrew() {
  const currentDate = new Date().toISOString();
  console.log(`\n🕒 Current System Time (Scout Reference): ${currentDate}\n`);

  console.log("🕵️  [The Scout] - Data Retrieval Component");
  console.log("   Executing Google Search Queries for top headlines from Zambia...");
  console.log("   Sources: Times of Zambia, Zambia Daily Mail, Diggers News\n");
  
  console.log("🧠 [The Analyst] - Fact-Checking & Logic Processing");
  console.log("   Filtering out stale news and extracting KPIs...\n");

  // Since we are running outside the specific browser preview token, I am mocking
  // the result of the LLM extracting exactly what you requested today.
  const mockedLLMResponse = [
    {
      "decision": "BoZ raises statutory reserve ratio by 1.5%",
      "kpi": "Kwacha exchange rate drops to 23/$",
      "question": "If BoZ announces a 1.5% statutory reserve ratio hike, will the Kwacha drop below 23/$ by May 1st?",
      "category": "Economy",
      "institution": "Bank of Zambia",
      "sourceHeadline": "BoZ hints at further monetary tightening as copper prices stall",
      "sourcePublication": "Diggers News"
    },
    {
      "decision": "Government approves Phase 2 of the Lobito Corridor expansion",
      "kpi": "Transport costs to Western Province fall by 15%",
      "question": "If the Lobito Corridor Phase 2 is passed this week, will Western Province transport costs drop 15% by Q3?",
      "category": "Governance",
      "institution": "Ministry of Transport",
      "sourceHeadline": "Lobito rail expansion heads to parliament for final phase 2 vote",
      "sourcePublication": "Times of Zambia"
    },
    {
      "decision": "Ministry restricts externalized mining dividends to 30%",
      "kpi": "Foreign exchange reserves rise by $500M",
      "question": "If Parliament caps mining dividends sent abroad at 30%, will forex reserves boost by $500M within 6 months?",
      "category": "Economy",
      "institution": "Ministry of Finance",
      "sourceHeadline": "Govt considers dividend cap on foreign mining operators to secure reserves",
      "sourcePublication": "Zambia Daily Mail"
    }
  ];

  console.log("📝 [The Writer & Formatter] - Final Output Generation");
  mockedLLMResponse.forEach((m: any, i: number) => {
    console.log(`\n--- Active Market 00${i + 1} ---`);
    console.log(`📰 Source:       ${m.sourcePublication} ("${m.sourceHeadline}")`);
    console.log(`🏛️  Institution:  ${m.institution}`);
    console.log(`📊 Category:     ${m.category}`);
    console.log(`⚖️  Trade Market: ${m.question}`);
  });

  console.log("\n💾 [The Database Writer]");
  console.log("   Committing new markets to Firestore...");
  console.log(`   (Simulated: db.collection('markets').add() executed for ${mockedLLMResponse.length} new active markets)\n`);
}

runAgentCrew();

