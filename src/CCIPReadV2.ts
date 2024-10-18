import {
	id,
	hexlify,
	Interface,
	isCallException,
	resolveAddress,
	type ContractRunner,
	type Provider,
	type TransactionRequest,
} from "ethers";

const ABI = new Interface([
	`error OffchainLookup(address sender, string[] urls, bytes request, bytes4 callback, bytes carry)`,
	`error OffchainTryNext(adddres sender)`,
]);

const UNANSWERED = id("OffchainLookupUnanswered()").slice(0, 10);

type OffchainSender = {
	sender: string;
};

type OffchainLookup = OffchainSender & {
	urls: string[];
	request: string;
	callback: string;
	carry: string;
};

export class CCIPReadV2 implements ContractRunner {
	constructor(readonly provider: Provider) {}

	async call(tx0: TransactionRequest): Promise<string> {
		if (!tx0.to || !tx0.enableCcipRead) return this.provider.call(tx0);
		const origin = await resolveAddress(tx0.to);
		let lookup = await this._call({
			...tx0,
			to: origin,
			enableCcipRead: false,
		}, false);
		if (typeof lookup === "string") return lookup;
		if (lookup.sender !== origin) throw new Error("origin != sender");
		let index = 0;
		while (true) {
			let response!: string;
			if (index < lookup.urls.length) {
				let url = lookup.urls[index++];
				try {
					const options: RequestInit = {};
					if (url.includes("{data}")) {
						options.method = "POST";
						options.body = JSON.stringify({
							sender: origin,
							data: lookup.request,
						});
					}
					url = url.replaceAll("{data}", lookup.request);
					url = url.replaceAll("{sender}", origin);
					const res = await fetch(url, options);
					const { data } = await res.json();
					response = hexlify(data);
				} catch (err) {
					continue;
				}
			} else {
				response = UNANSWERED;
			}
			const next = await this._call({ to: origin, data: response }, true);
			if (typeof next === "string") return next;
			if (next.sender !== origin) throw new Error("origin != sender");
			if ("urls" in next) {
				index = 0;
				lookup = next;
			}
		}
	}

	async _call(
		tx: TransactionRequest,
		canNext: false
	): Promise<string | OffchainLookup>;
	async _call(
		tx: TransactionRequest,
		canNext: true
	): Promise<string | OffchainLookup | OffchainSender>;
	async _call(
		tx: TransactionRequest,
		canNext: boolean
	): Promise<string | OffchainLookup | OffchainSender> {
		try {
			return await this.call({ ...tx, enableCcipRead: false });
		} catch (err) {
			if (!isCallException(err) || !err.data || err.data.length < 10)
				throw err;
			const error = ABI.parseError(err.data);
			if (error?.name === "OffchainLookup") {
				return <OffchainLookup>error.args.toObject();
			} else if (canNext && error?.name === "OffchainTryNext") {
				return <OffchainSender>error.args.toObject();
			}
			throw err;
		}
	}
}
