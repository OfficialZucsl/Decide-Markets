```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Wallet, ChevronDown, Loader2 } from 'lucide-react';
import {
  collection,
  onSnapshot,
  doc,
  runTransaction,
  query,
  setDoc,
} from 'firebase/firestore';

import { db, handleFirestoreError, OperationType } from './firebase';
import { calculateProbability, calculateNewShares } from './lib/lmsr';

// --- Types ---
interface Market {
  id: string;
  decision?: string;
  kpi?: string;
  question: string;
  yesPoints: number;
  noPoints: number;
  category: string;
  institution: string;
  status: 'open' | 'closed' | 'resolved';
}

const seedMarketIds = new Set([
  'm1',
  'm2',
  'm3',
  'm4',
  'm5',
  'm6',
  'm7',
  'm8',
  'm9',
  'm10',
]);

const seedMarkets: Market[] = [
  {
    id: 'm1',
    question:
      'If BoZ hikes rates 200bps, will the Kwacha stay under 25/$ by June?',
    yesPoints: 7200,
    noPoints: 2800,
    category: 'Economy',
    institution: 'Bank of Zambia',
    status: 'open',
  },
  {
    id: 'm2',
    question:
      'If FISP maize subsidies end, will inflation drop below 10% by July?',
    yesPoints: 3500,
    noPoints: 6500,
    category: 'Finance',
    institution: 'Ministry of Finance',
    status: 'open',
  },
  {
    id: 'm3',
    question:
      'If Lusaka privatizes waste, will cholera cases drop 50% next rainy season?',
    yesPoints: 8900,
    noPoints: 1100,
    category: 'Public Services',
    institution: 'Ministry of Health',
    status: 'open',
  },
  {
    id: 'm4',
    question:
      "If the incumbent is re-elected, will their 'Promise-to-Action' legislative ratio exceed 60% in Year 1?",
    yesPoints: 4100,
    noPoints: 5900,
    category: 'Governance • Candidate',
    institution: 'Civic Tracker NGO',
    status: 'open',
  },
  {
    id: 'm5',
    question:
      'If the government waives import duties on solar panels, will solar adoption in rural areas increase by 30%?',
    yesPoints: 5000,
    noPoints: 5000,
    category: 'Services',
    institution: 'Ministry of Energy',
    status: 'open',
  },
  {
    id: 'm6',
    question:
      'If the new mining tax regime is implemented, will copper production exceed 1 million tonnes next year?',
    yesPoints: 6000,
    noPoints: 4000,
    category: 'Mining',
    institution: 'Chamber of Mines',
    status: 'open',
  },
  {
    id: 'm7',
    question:
      'If FISP is reformed to include electronic vouchers, will maize yields increase by 20%?',
    yesPoints: 5500,
    noPoints: 4500,
    category: 'Agriculture',
    institution: 'Ministry of Agriculture',
    status: 'open',
  },
  {
    id: 'm8',
    question:
      'If the national broadband policy is updated, will internet penetration reach 60% by year end?',
    yesPoints: 4000,
    noPoints: 6000,
    category: 'ICT',
    institution: 'ZICTA',
    status: 'open',
  },
  {
    id: 'm9',
    question:
      'If the new SEZs are operationalized, will manufacturing GDP contribution rise by 2%?',
    yesPoints: 4500,
    noPoints: 5500,
    category: 'Manufacturing',
    institution: 'Ministry of Commerce',
    status: 'open',
  },
  {
    id: 'm10',
    question:
      'If the visa waiver program is expanded, will tourist arrivals increase by 15% this year?',
    yesPoints: 5200,
    noPoints: 4800,
    category: 'Tourism',
    institution: 'Zambia Tourism Agency',
    status: 'open',
  },
];

export default function App() {
  const [points, setPoints] = useState(1500);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [timeFilter, setTimeFilter] = useState('All');
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isVoting, setIsVoting] = useState(false);

  // Pseudonym System
  const [username, setUsername] = useState<string | null>(
    localStorage.getItem('decide_username')
  );

  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [tempUsername, setTempUsername] = useState('');

  useEffect(() => {
    const storedUsername = localStorage.getItem('decide_username');

    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  // Markets load immediately
  useEffect(() => {
    const q = query(collection(db, 'markets'));

    const unsubscribeMarkets = onSnapshot(
      q,
      (snapshot) => {
        const liveMarkets: Market[] = [];

        snapshot.docs.forEach((d) => {
          const data = d.data();

          liveMarkets.push({
            id: d.id,
            question: data.question || data.decision + '? → ' + data.kpi,
            decision: data.decision,
            kpi: data.kpi,
            yesPoints: data.yesPoints,
            noPoints: data.noPoints,
            category: data.category,
            institution: data.institution,
            status: data.status,
          });
        });

        if (liveMarkets.length === 0) {
          setMarkets(seedMarkets);
        } else {
          setMarkets(liveMarkets);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'markets');
      }
    );

    return () => unsubscribeMarkets();
  }, []);

  const handleSaveUsername = () => {
    const trimmed = tempUsername.trim();

    if (!trimmed) return;

    localStorage.setItem('decide_username', trimmed);
    setUsername(trimmed);
    setShowUsernameModal(false);
  };

  const handleVote = async (side: 'YES' | 'NO', amount: number) => {
    if (!selectedMarket || !username) {
      setShowUsernameModal(true);
      return;
    }

    setIsVoting(true);

    const isSeedMarket = seedMarketIds.has(selectedMarket.id);

    if (isSeedMarket) {
      setMarkets((prev) =>
        prev.map((m) => {
          if (m.id === selectedMarket.id) {
            const { newQYes, newQNo } = calculateNewShares(
              m.yesPoints,
              m.noPoints,
              amount,
              side === 'YES'
            );

            return {
              ...m,
              yesPoints: newQYes,
              noPoints: newQNo,
            };
          }

          return m;
        })
      );

      setPoints((p) => p - amount);
      setSelectedMarket(null);
      setIsVoting(false);
      return;
    }

    try {
      const marketRef = doc(db, 'markets', selectedMarket.id);
      const tradeRef = doc(collection(db, 'trades'));

      const tradeData = {
        username,
        marketId: selectedMarket.id,
        position: side,
        points: amount,
        createdAt: new Date().toISOString(),
      };

      await runTransaction(db, async (transaction) => {
        const marketDoc = await transaction.get(marketRef);

        if (!marketDoc.exists()) {
          throw new Error('Market does not exist');
        }

        const currentYes = marketDoc.data().yesPoints;
        const currentNo = marketDoc.data().noPoints;

        const { newQYes, newQNo, sharesBought } =
          calculateNewShares(
            currentYes,
            currentNo,
            amount,
            side === 'YES'
          );

        transaction.update(marketRef, {
          yesPoints: newQYes,
          noPoints: newQNo,
        });

        transaction.set(tradeRef, {
          ...tradeData,
          sharesBought,
        });
      });

      setPoints((p) => p - amount);
      setSelectedMarket(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'markets/trades');
    } finally {
      setIsVoting(false);
    }
  };

  const adminCurateMarkets = async () => {
    if (username !== 'admin') return;

    const simulatedLiveNews = [
      {
        decision:
          'ECZ implements biometric voter verification nationwide',
        kpi:
          'Opposition petition rate drops by 40% post-elections',
        question:
          'If ECZ enforces biometric national verification next month, will post-election petitions drop 40%?',
        category: 'Politics • Elections',
        institution: 'Electoral Commission of Zambia',
        yesPoints: 12000,
        noPoints: 8000,
        status: 'open',
      },
      {
        decision:
          'Parliament passes the revised Public Order Act',
        kpi:
          'Police-sanctioned opposition rallies increase by 25%',
        question:
          'If the new Public Order Act is enacted, will approved opposition rallies increase by 25% by Q4?',
        category: 'Politics • Legal',
        institution: 'Ministry of Home Affairs',
        yesPoints: 9500,
        noPoints: 10500,
        status: 'open',
      },
      {
        decision:
          'Anti-Corruption Commission declares amnesty for asset recovery',
        kpi:
          'Over K500 million is recovered in 60 days',
        question:
          'If ACC announces a 60-day asset recovery amnesty, will over K500 million be returned?',
        category: 'Politics • Transparency',
        institution: 'Anti-Corruption Commission',
        yesPoints: 15000,
        noPoints: 5000,
        status: 'open',
      },
    ];

    try {
      for (const market of simulatedLiveNews) {
        const marketRef = doc(collection(db, 'markets'));

        await setDoc(marketRef, {
          ...market,
          createdAt: new Date().toISOString(),
        });
      }

      alert('Markets successfully pushed to Firestore.');
    } catch (error) {
      console.error(error);

      handleFirestoreError(
        error,
        OperationType.WRITE,
        'markets'
      );

      alert('Failed to push to Firestore.');
    }
  };

  const filteredMarkets = markets.filter((market) => {
    let matchesCategory = true;

    if (categoryFilter) {
      if (
        categoryFilter === 'Trending' ||
        categoryFilter === 'Breaking'
      ) {
        matchesCategory = true;
      } else if (categoryFilter === 'Governance') {
        matchesCategory = market.category
          .toLowerCase()
          .includes('governance');
      } else {
        matchesCategory = market.category
          .toLowerCase()
          .includes(categoryFilter.toLowerCase());
      }
    }

    let matchesSector = true;

    if (sectorFilter) {
      matchesSector = market.category
        .toLowerCase()
        .includes(sectorFilter.toLowerCase());
    }

    return matchesCategory && matchesSector;
  });

  return (
    <div className="min-h-screen bg-[#FBFBFD] font-sans text-[#1D1D1F] antialiased">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-black rounded-[0.5rem] flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-white rounded-full" />
            </div>

            <span
              className="text-xl font-bold tracking-tight cursor-pointer"
              onClick={() => {
                setCategoryFilter(null);
                setSectorFilter(null);
              }}
            >
              Decide
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-8 text-sm font-semibold text-gray-500">
            <button
              onClick={() => {
                setCategoryFilter('Trending');
                setSectorFilter(null);
              }}
              className={`transition-colors ${
                categoryFilter === 'Trending'
                  ? 'text-blue-600'
                  : 'hover:text-blue-600'
              }`}
            >
              Trending
            </button>

            <button
              onClick={() => {
                setCategoryFilter('Breaking');
                setSectorFilter(null);
              }}
              className={`transition-colors flex items-center space-x-1.5 ${
                categoryFilter === 'Breaking'
                  ? 'text-blue-600'
                  : 'hover:text-blue-600'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>

              <span
                className={
                  categoryFilter === 'Breaking'
                    ? 'text-blue-600'
                    : 'text-gray-900'
                }
              >
                Breaking
              </span>
            </button>

            <button
              onClick={() => {
                setCategoryFilter('Economy');
                setSectorFilter(null);
              }}
              className={`transition-colors ${
                categoryFilter === 'Economy'
                  ? 'text-blue-600'
                  : 'hover:text-blue-600'
              }`}
            >
              Economy
            </button>

            <button
              onClick={() => {
                setCategoryFilter('Finance');
                setSectorFilter(null);
              }}
              className={`transition-colors ${
                categoryFilter === 'Finance'
                  ? 'text-blue-600'
                  : 'hover:text-blue-600'
              }`}
            >
              Finance
            </button>

            <div className="relative group py-4">
              <button
                onClick={() => {
                  setCategoryFilter('Governance');
                  setSectorFilter(null);
                }}
                className={`flex items-center space-x-1 transition-colors ${
                  categoryFilter === 'Governance'
                    ? 'text-blue-600'
                    : 'hover:text-blue-600 text-gray-900'
                }`}
              >
                <span>Governance</span>

                <ChevronDown className="w-4 h-4 opacity-50 group-hover:rotate-180 transition-transform duration-300" />
              </button>

              <div className="absolute top-full left-0 mt-[-8px] w-48 bg-white/90 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-40">
                <div className="p-2 flex flex-col">
                  <button
                    onClick={() => {
                      setCategoryFilter('Institutions');
                      setSectorFilter(null);
                    }}
                    className="text-left px-4 py-2 hover:bg-gray-50 rounded-xl text-gray-900 transition-colors"
                  >
                    Institutions
                  </button>

                  <button
                    onClick={() => {
                      setCategoryFilter('Public Services');
                      setSectorFilter(null);
                    }}
                    className="text-left px-4 py-2 hover:bg-gray-50 rounded-xl text-gray-900 transition-colors"
                  >
                    Public Services
                  </button>

                  <div className="h-px w-full bg-gray-100 my-1" />

                  <button
                    onClick={() => {
                      setCategoryFilter('Candidate');
                      setSectorFilter(null);
                    }}
                    className="text-left px-4 py-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors flex items-center justify-between"
                  >
                    <span>Candidates</span>

                    <span className="text-[10px] bg-blue-100 px-2 py-0.5 rounded-full">
                      KPIs
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setCategoryFilter('Politics');
                setSectorFilter(null);
              }}
              className={`transition-colors ${
                categoryFilter === 'Politics'
                  ? 'text-blue-600'
                  : 'hover:text-blue-600'
              }`}
            >
              Politics
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <div className="bg-gray-50 px-4 py-1.5 rounded-full border border-gray-100 flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-blue-600" />

              <span className="text-sm font-semibold">
                {points.toLocaleString()} pts
              </span>
            </div>

            {username ? (
              <div className="text-sm font-semibold text-gray-700">
                @{username}
              </div>
            ) : (
              <button
                onClick={() => setShowUsernameModal(true)}
                className="bg-black text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                Choose Name
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-16 pb-24 flex flex-col md:flex-row gap-12 lg:gap-16">
        <aside className="w-full md:w-48 shrink-0">
          <div className="sticky top-28 flex flex-col space-y-8">
            <div className="flex flex-col space-y-1">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-4">
                Timeline
              </h3>

              {['All', 'Daily', 'Weekly'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`text-left px-4 py-2.5 rounded-2xl font-semibold transition-all duration-300 ${
                  className={`text-left px-4 py-2.5 rounded-2xl font-semibold transition-all duration-300 ${
                    timeFilter === filter
                      ? 'bg-white text-blue-600 shadow-sm border border-gray-100'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="flex flex-col space-y-1">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-4">
                Sectors
              </h3>

              {[
                'Mining',
                'Agriculture',
                'Manufacturing',
                'ICT',
                'Tourism',
                'Services',
              ].map((sector) => (
                <button
                  key={sector}
                  onClick={() => {
                    setSectorFilter(
                      sector === sectorFilter ? null : sector
                    );

                    setCategoryFilter(null);
                  }}
                  className={`text-left px-4 py-2.5 rounded-2xl font-semibold transition-all duration-300 ${
                    sectorFilter === sector
                      ? 'bg-white text-blue-600 shadow-sm border border-gray-100'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {sector}
                </button>
              ))}
            </div>

            {username === 'admin' && (
              <div className="pt-8">
                <button
                  onClick={adminCurateMarkets}
                  className="w-full text-left px-4 py-2.5 rounded-2xl font-semibold text-[11px] bg-black text-white hover:bg-gray-800 transition-all duration-300 flex items-center justify-between"
                >
                  <span>Admin: Curate News</span>

                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="mb-20">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
            >
              Tied to Decizions, <br />

              <span className="text-blue-600">
                not just Outcomes.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-gray-500 max-w-3xl font-medium"
            >
              Most institutions make decisions based on politics.
              We turn fuzzy governance into testable,
              optimizable decisions by tying clear KPIs to
              institutional actions.
            </motion.p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredMarkets.length > 0 ? (
              filteredMarkets.map((market) => {
                const prob =
                  calculateProbability(
                    market.yesPoints,
                    market.noPoints
                  ) * 100;

                return (
                  <motion.div
                    key={market.id}
                    layoutId={market.id}
                    onClick={() => setSelectedMarket(market)}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -6, scale: 1.02 }}
                    transition={{ duration: 0.3 }}
                    className="group relative bg-white border border-gray-100 rounded-[2.5rem] p-8 cursor-pointer shadow-sm hover:shadow-2xl hover:shadow-blue-500/15 overflow-hidden flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-8">
                      <div className="flex items-center space-x-2 bg-blue-50/50 px-3 py-1 rounded-full border border-blue-100/50">
                        <ShieldCheck className="w-3 h-3 text-blue-600" />

                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                          {market.institution}
                        </span>
                      </div>

                      <span className="text-xs font-bold text-gray-300 tracking-widest">
                        {market.category}
                      </span>
                    </div>

                    <div className="flex-grow mb-8">
                      <h3 className="text-xl font-semibold leading-snug text-gray-900 group-hover:text-blue-600 transition-colors duration-300">
                        {market.question}
                      </h3>
                    </div>

                    <div className="mt-auto">
                      <div className="flex items-baseline space-x-1 mb-4">
                        <span className="text-6xl font-bold tracking-tighter">
                          {Math.round(prob)}
                        </span>

                        <span className="text-2xl font-bold text-gray-400">
                          %
                        </span>
                      </div>

                      <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${prob}%` }}
                          className="h-full bg-blue-600"
                        />
                      </div>

                      <div className="mt-4 flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                        <span>Chance of Success</span>

                        <span>
                          {(
                            market.yesPoints +
                            market.noPoints
                          ).toLocaleString()}{' '}
                          Votes
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full py-20 text-center text-gray-400 font-medium">
                No active markets found for this filter. AI
                Agents are currently scraping the latest news...
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Market Modal */}
      <AnimatePresence>
        {selectedMarket && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMarket(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />

            <motion.div
              layoutId={selectedMarket.id}
              className="relative bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl"
            >
              <h3 className="text-3xl font-bold mb-10 leading-tight text-gray-900">
                {selectedMarket.question}
              </h3>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() => handleVote('YES', 100)}
                  disabled={isVoting}
                  className="py-6 rounded-3xl font-bold text-2xl transition-all shadow-lg flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30"
                >
                  {isVoting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    'Yes'
                  )}
                </button>

                <button
                  onClick={() => handleVote('NO', 100)}
                  disabled={isVoting}
                  className="py-6 rounded-3xl font-bold text-2xl transition-all flex items-center justify-center bg-gray-900 text-white hover:bg-black"
                >
                  {isVoting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    'No'
                  )}
                </button>
              </div>

              <div className="text-center text-sm font-medium italic">
                {username ? (
                  <span className="text-gray-400">
                    Allocating 100 points as @{username}.
                    Resolution verified by{' '}
                    {selectedMarket.institution}.
                  </span>
                ) : (
                  <span className="text-red-500 font-bold">
                    Choose a pseudonym to vote.
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Username Modal */}
      <AnimatePresence>
        {showUsernameModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
              onClick={() => setShowUsernameModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">
                Choose Your Pseudonym
              </h2>

              <input
                type="text"
                value={tempUsername}
                onChange={(e) =>
                  setTempUsername(e.target.value)
                }
                placeholder="e.g. MarketWizard"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-blue-500"
              />

              <button
                onClick={handleSaveUsername}
                className="w-full mt-6 bg-black text-white py-3 rounded-2xl font-semibold hover:bg-gray-800 transition-colors"
              >
                Continue
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}