import { Interface, JsonRpcProvider, Contract } from "ethers";
import { CCIPReadV2 } from "../src/CCIPReadV2";

const provider = new JsonRpcProvider("https://rpc.ankr.com/eth", 1, {
	staticNetwork: true,
});
const resolver = await provider.getResolver("base.eth");
if (!resolver) throw new Error("wtf");

const ABI = new Interface([
	"function resolve(bytes, bytes) view returns (bytes)",
]);

const v1 = new Contract(resolver.address, ABI, provider);
const v2 = new Contract(resolver.address, ABI, new CCIPReadV2(provider));
