import { Peer } from "./peer.js";

const peerConfigs = [
  { name: "Andrew", port: 15001 },
  { name: "Avery", port: 15002 },
  { name: "Robin", port: 15003 },
  { name: "Henry", port: 15004 },
  { name: "Chad", port: 15005 },
  { name: "Edison", port: 15006 },
];

// Fully connect peers
async function connectAll(peers) {
  for (let i = 0; i < peers.length; i++) {
    for (let j = i + 1; j < peers.length; j++) {
      await peers[i].dial(peers[j]);
    }
  }
  console.log("[connect] done");
}

async function setup(verbose = false) {
  const peers = [];

  // Create + start peers
  for (const cfg of peerConfigs) {
    const peer = new Peer(cfg.name, cfg.port, verbose);
    await peer.start();
    peers.push(peer);
  }

  await connectAll(peers);

  console.log("[setup] done");

  return peers;
}

async function p2pSearch(peers, keywords, testCase, label = "unnamed search") {
  console.log(`[benchmark] searching ${keywords.length} keywords`);
  const requester = peers[0]; // pick first peer as origin

  const latencies = {}; // { keyword: latency }
  const receivedKeywords = new Set();
  const expectedReceivedKeywords = new Set(keywords);

  let trafficCounter = 0;

  // Temporary listener to track search results
  function resultHandler(request) {
    trafficCounter++;
    if (
      request.type === "search_result" &&
      request.target_id === requester.node.peerId.toString()
    ) {
      const now = Date.now();
      const keyword = request.files[0]; // assuming single file match
      if (!receivedKeywords.has(keyword)) {
        latencies[keyword] = now - request.timestamp;
        receivedKeywords.add(keyword);
      }
    }
  }

  requester.node.services.pubsub.addEventListener("message", (evt) => {
    const request = JSON.parse(new TextDecoder().decode(evt.detail.data));
    resultHandler(request);
  });

  const startAll = Date.now();

  // Send queries for all keywords
  for (const keyword of keywords) {
    const search_result = await requester.sendQuery("search", {
      keyword,
      testCase,
    });
    if (search_result.local) {
      // Edge case: ignore local results
      const now = Date.now();
      console.log(search_result);
      latencies[keyword] = now - search_result.timestamp;
      receivedKeywords.add(keyword);
    }
  }

  // Wait until all responses received or timeout
  const timeout = 5000; // 5s max
  const pollInterval = 10;
  let waited = 0;
  while (
    receivedKeywords.size < expectedReceivedKeywords.size &&
    waited < timeout
  ) {
    await new Promise((r) => setTimeout(r, pollInterval));
    waited += pollInterval;
    if (waited >= timeout) {
      console.log("[benchmark] timed out");
    }
  }

  const totalTime = Date.now() - startAll;

  console.log(`--- Benchmark results ---`);
  console.log(`Total keywords queried: ${keywords.length}`);
  console.log(`Total messages sent (traffic): ${trafficCounter}`);
  console.log(`Files received: ${receivedKeywords.size}`);

  for (const keyword of keywords) {
    if (receivedKeywords.has(keyword)) {
      console.log(
        `[SUCCESS] Keyword "${keyword}" latency: ${latencies[keyword]} ms`,
      );
    } else {
      console.log(`[TIMEOUT] Keyword "${keyword}" did not receive a result`);
    }
  }

  const avgLatency =
    Object.values(latencies).length > 0
      ? Object.values(latencies).reduce((a, b) => a + b, 0) /
        Object.values(latencies).length
      : 0;

  const throughput = Object.values(latencies).length / (totalTime / 1000);

  console.log(`Average latency: ${avgLatency.toFixed(2)} ms`);
  console.log(`Throughput: ${throughput.toFixed(2)} queries/sec`);

  return {
    label,
    latencies: { ...latencies },
    receivedKeywords: new Set(receivedKeywords),
    trafficCounter,
    totalTime,
    avgLatency,
    throughput,
  };
}

function compareTestResults(results, groupLabel = "unnamed group") {
  if (!results || results.length === 0) {
    console.log("No results to compare.");
    return;
  }

  console.log(
    `\n========== Benchmark Comparison of ${groupLabel} ==========\n`,
  );

  // Summary table
  const summary = results.map((r) => ({
    Test: r.label,
    "Total Time (ms)": r.totalTime,
    "Avg Latency (ms)": r.avgLatency.toFixed(2),
    "Throughput (q/s)": r.throughput.toFixed(2),
    "Traffic (msgs)": r.trafficCounter,
    "Files Received": r.receivedKeywords.size,
  }));

  console.table(summary);

  // ---- Per-keyword comparison ----
  console.log("\n========== Per-Keyword Latency ==========\n");

  // Collect all unique keywords
  const allKeywords = new Set();
  results.forEach((r) => {
    Object.keys(r.latencies).forEach((k) => allKeywords.add(k));
  });

  const keywordTable = [];

  for (const keyword of allKeywords) {
    const row = { Keyword: keyword };

    results.forEach((r) => {
      row[r.label] =
        r.latencies[keyword] !== undefined
          ? `${r.latencies[keyword]} ms`
          : "NaN";
    });

    keywordTable.push(row);
  }

  console.table(keywordTable);

  console.log("==========================================\n");
}

async function shutdownAll(peers) {
  for (const p of peers) {
    await p.shutdown();
  }
  console.log("[shutdown] all peers stopped");
}

// TESTS - Uses the first peer (Andrew) as the sender
async function testBroadcast(peers) {
  await peers[0].sendQuery(
    "broadcast",
    {
      msg: "Hello friends",
    },
    true,
  );
}

async function testBasicSearch(peers) {
  const keywords = ["robin.jpeg"];
  await p2pSearch(peers, keywords, "benchmark");
}

async function testNoneExistFile(peers) {
  const keywords = ["edison.mp3"];
  await p2pSearch(peers, keywords, "benchmark");
}

async function testSelfContains(peers) {
  const keywords = ["andrew.txt"];
  await p2pSearch(peers, keywords, "benchmark");
}

async function test10Unique(peers) {
  const keywords = [
    "robin.jpeg",
    "robin.txt",
    "henry.jpeg",
    "henry.txt",
    "edison.txt",
    "edison.jpeg",
    "chad.txt",
    "chad.jpeg",
    "avery.txt",
    "avery.jpeg",
  ];
  return await p2pSearch(
    peers,
    keywords,
    "benchmark",
    "Search 10 unique files in benchmark",
  );
}

async function test10Common(peers) {
  const keywords = [
    "common_file.txt",
    "common_file copy.txt",
    "common_file copy 2.txt",
    "common_file copy 3.txt",
    "common_file copy 4.txt",
    "common_file.txt",
    "common_file copy.txt",
    "common_file copy 2.txt",
    "common_file copy 3.txt",
    "common_file copy 4.txt",
  ];
  return await p2pSearch(
    peers,
    keywords,
    "benchmark",
    "Search 10 common files in benchmark",
  );
}

async function Option1_1TestBaselineMeasurement(peers) {
  const t1 = await test10Common(peers);
  const t2 = await test10Unique(peers);
  compareTestResults([t1, t2], "Option 1.1 - Baseline Measurement");
}

async function Option1_2_1TestSharedFileWithSameQuery(peers) {
  const keywords = [
    "common_file.txt",
    "common_file copy.txt",
    "common_file copy 2.txt",
    "common_file copy 3.txt",
    "common_file copy 4.txt",
    "common_file.txt",
    "common_file copy.txt",
    "common_file copy 2.txt",
    "common_file copy 3.txt",
    "common_file copy 4.txt",
  ];
  const t1 = await p2pSearch(
    peers,
    keywords,
    "benchmark",
    "Search benchmark storage",
  );
  const t2 = await p2pSearch(
    peers,
    keywords,
    "10common",
    "Search 10common storage",
  );
  const t3 = await p2pSearch(
    peers,
    keywords,
    "20common",
    "Search 20common storage",
  );
  compareTestResults(
    [t1, t2, t3],
    "Option 1.2.1 - Different number of shared files with fixed query",
  );
}

async function Option1_2_2TestDifferentNumberOfQueries(peers) {
  const keywords10 = [
    "common_file.txt",
    "common_file copy.txt",
    "common_file copy 2.txt",
    "common_file copy 3.txt",
    "common_file copy 4.txt",
    "common_file copy 5.txt",
    "common_file copy 6.txt",
    "common_file copy 7.txt",
    "common_file copy 8.txt",
    "common_file copy 9.txt",
  ];
  const keywords20 = [
    ...keywords10,
    "common_file copy 10.txt",
    "common_file copy 11.txt",
    "common_file copy 12.txt",
    "common_file copy 13.txt",
    "common_file copy 14.txt",
    "common_file copy 15.txt",
    "common_file copy 16.txt",
    "common_file copy 17.txt",
    "common_file copy 18.txt",
    "common_file copy 19.txt",
  ];
  const keywords40 = [...keywords20, ...keywords20];
  const t1 = await p2pSearch(peers, keywords10, "20common", "Search 10");
  const t2 = await p2pSearch(peers, keywords20, "20common", "Search 20");
  const t3 = await p2pSearch(peers, keywords40, "20common", "Search 40");
  compareTestResults(
    [t1, t2, t3],
    "Option 1.2.2 - Different Number of Queries",
  );
}

async function main() {
  const peers = await setup();
  // await testSelfContains(peers);
  // await Option1_1TestBaselineMeasurement(peers);
  // await Option1_2_1TestSharedFileWithSameQuery(peers);
  await Option1_2_2TestDifferentNumberOfQueries(peers);
  await shutdownAll(peers);
}

main();
