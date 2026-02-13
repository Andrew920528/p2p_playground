import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { yamux } from "@chainsafe/libp2p-yamux";
import { noise } from "@chainsafe/libp2p-noise";
import { mdns } from "@libp2p/mdns";
import { gossipsub } from "@libp2p/gossipsub";
import { identify } from "@libp2p/identify";
import fs from "fs";

const TOPIC = "Hub-1107-P2P";

export class Peer {
  constructor(name, port, verbose = false) {
    this.name = name;
    this.port = port;
    this.verbose = verbose;
    this.node = null;
  }

  async start() {
    this.node = await createLibp2p({
      addresses: { listen: [`/ip4/127.0.0.1/tcp/${this.port}`] },
      transports: [tcp()],
      streamMuxers: [yamux()],
      connectionEncrypters: [noise()],
      peerDiscovery: [mdns({ interval: 1000 })],
      services: { identify: identify(), pubsub: gossipsub() },
    });

    // Subscribe to topic
    this.node.services.pubsub.subscribe(TOPIC);

    // Handle incoming messages
    this.node.services.pubsub.addEventListener("message", (evt) => {
      const request = JSON.parse(new TextDecoder().decode(evt.detail.data));
      this.handleMessage(request);
    });

    await this.node.start();
    console.log(`[${this.name}] started as ${this.node.peerId}`);
  }

  handleMessage(request) {
    if (this.verbose) {
      console.log(
        `[${this.name}] received from ${request.sender_name}: Type = ${request.type}`,
      );
    }

    switch (request.type) {
      case "broadcast":
        if (this.verbose)
          console.log(`[${this.name}] broadcast: ${request.msg}`);
        break;

      case "search":
        this.handleSearch(request);
        break;

      case "search_result":
        this.handleSearchResult(request);
        break;
    }
  }

  // Handle search requests
  async handleSearch(request) {
    const keyword = request.keyword;
    const folder = `./storage/${request.testCase}/${this.name}`;
    let matches = [];

    if (fs.existsSync(folder)) {
      const files = fs.readdirSync(folder);
      matches = files.filter((file) => file === keyword);
    }

    // Send result directly via PubSub; everyone sees it but only origin processes
    if (matches.length > 0) {
      const resultMsg = {
        type: "search_result",
        request_id: request.request_id,
        responder_name: this.name,
        responder_id: this.node.peerId.toString(),
        files: matches,
        target_id: request.origin_id, // origin peer
      };
      await this.sendQuery("search_result", resultMsg);
      return true;
    }
    return false;
  }

  handleSearchResult(request) {
    if (request.target_id !== this.node.peerId.toString()) return;
    if (this.verbose)
      console.log(
        `[${this.name}] received search result from ${request.responder_name}: ${request.files}`,
      );
  }

  // Protocol:
  // broadcast: {msg: str}
  // search: {keyword: str, testCase: str}
  // search_result: {request_id: str, responder_name: str, responder_id: str, files: [str], target_id: str}
  async sendQuery(type, payload) {
    const uuid = crypto.randomUUID();
    const start = Date.now();

    const message = {
      type,
      request_id: payload.request_id ?? uuid,
      timestamp: start,
      origin_id: this.node.peerId.toString(),
      origin_name: this.name,
      sender_id: this.node.peerId.toString(),
      sender_name: this.name,
      ...payload,
    };

    if (type === "search") {
      // Searches local storage
      const contains = await this.handleSearch(message);
      if (contains) {
        if (this.verbose) console.log(`[${this.name}] file found locally`);
        return { uuid, timestamp: start, local: true };
      }
    }

    await this.node.services.pubsub.publish(
      TOPIC,
      new TextEncoder().encode(JSON.stringify(message)),
    );

    if (this.verbose) {
      console.log(`[${this.name}] sent: ${JSON.stringify(message)}`);
    }

    return { uuid, timestamp: start };
  }

  getMultiaddr() {
    return this.node.getMultiaddrs()[0];
  }

  async dial(otherPeer) {
    await this.node.dial(otherPeer.getMultiaddr());
    if (this.verbose) console.log(`[connect] ${this.name} → ${otherPeer.name}`);
  }

  async shutdown() {
    if (this.node) {
      await this.node.stop();
      console.log(`[${this.name}] stopped`);
    }
  }
}
