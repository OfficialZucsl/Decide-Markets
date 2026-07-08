const { seedMarketsToFirestore } = require('./lib/lib/firestoreSeed');

const testMarkets = [
  {
    decision: "Test: BoZ adjusts policy rate",
    kpi: "Inflation falls below 9%",
    question: "If BoZ adjusts the policy rate, will inflation fall below 9% by September 2026?",
    category: "Economy",
    institution: "Bank of Zambia",
    yesPoints: 5000,
    noPoints: 5000,
    status: "open"
  },
  {
    decision: "Test: ZESCO upgrades grid",
    kpi: "Loadshedding hours drop 50%",
    question: "If ZESCO completes the grid upgrade, will loadshedding hours drop 50% by Q4 2026?",
    category: "Public Services",
    institution: "ZESCO",
    yesPoints: 5000,
    noPoints: 5000,
    status: "open"
  }
];

seedMarketsToFirestore(testMarkets)
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(err => console.error('FAILED:', err));
