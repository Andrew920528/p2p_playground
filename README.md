# Project Description

This project uses `libp2p`, a modern, modular library to create p2p overlay system. In `peer.js`, I defined a Peer class, which is a node in the p2p system. I wrote multiple test cases in run.js to show the statistics relevant to a 6-node p2p toy environment.

This project is for HW2, Option1, and contains workload setup for both 1.2.1 and 1.2.2

# Setup

To run this project, you will need to have npm installed. In the root directory, run

```
npm install
```

After that, run

```
node run.js
```

to start the p2p system.

There are multiple test cases in run.js for you to test out. For the homework requirement, `Option1_1TestBaselineMeasurement(peers);` and `Option1_2_2TestDifferentNumberOfQueries(peers);` gives statistics asked by quesiton 1.1 and 1.2.2. I also tested 1.2.1. All the results and discussion can be found in `results_and_reflection`.

# Deliverables

1. `README.md` and executable code in zip file. You can find the github repo here: (https://github.com/Andrew920528/p2p_playground)
2. Screenshots, measurement, results, discussion, and reflection: Please find it in a separate hw submission. I also attached a copy of it in the zip file called `results_and_reflection`.

# Peer class documentation

| Parameter | Type    | Description              |
| --------- | ------- | ------------------------ |
| `name`    | string  | Human-readable peer name |
| `port`    | number  | TCP port for listening   |
| `verbose` | boolean | Enables detailed logging |

The `Peer` class represents a node in a **Libp2p-based peer-to-peer (P2P) network**.  
It supports:

- Peer discovery via mDNS
- Secure TCP connections
- PubSub messaging (GossipSub)
- File search across peers
- Local file storage lookup

All communication occurs over a shared PubSub topic.

```js
const TOPIC = "Hub-1107-P2P";
```

---

## Messages

There are three types of messages: `broadcast`, `search`, and `search_result`.

`search_result` is a special response message to a `search` which looks for files that matches a keyword. `broadcast` is a message for testing purpose, that prints out the broadcasted message in the console when a peer recieves it.

`search_result` format

```
{
  type: "search_result",
  request_id,
  responder_name,
  responder_id,
  files,
  target_id
}
```

Other message protocols

```
// <type>: <payload>
// broadcast: {msg: str}
// search: {keyword: str, testCase: str}
{
  type,
  request_id,
  timestamp,
  origin_id,
  origin_name,
  sender_id,
  sender_name,
  ...payload
}
```
