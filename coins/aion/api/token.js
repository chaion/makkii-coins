import BigNumber from 'bignumber.js';
import Contract from 'aion-web3-eth-contract';
import AbiCoder from 'aion-web3-eth-abi';
import axios from 'axios';
import {processRequest } from './jsonrpc';
import ApiCaller from "../../../utils/Api_caller";
import {getEndpoint, CONTRACT_ABI} from "./constants";
import {hexToAscii} from "../../../utils";
import {app_server_api} from "../../../remote_server";

function fetchAccountTokens(address, network) {
    return new Promise((resolve, reject) => {
        const url = `https://${network}-api.aion.network/aion/dashboard/getAccountDetails?accountAddress=${address.toLowerCase()}`;
        ApiCaller.get(url)
            .then(json => {
                const res = {};
                if (json.content.length > 0) {
                    const { tokens } = json.content[0];
                    tokens.forEach(token => {
                        res[token.symbol] = {
                            symbol: token.symbol,
                            contractAddr: token.contractAddr,
                            name: token.name,
                            tokenDecimal: token.tokenDecimal,
                            balance: BigNumber(0),
                            tokenTxs: {},
                        };
                    });
                }
                resolve(res);
            })
            .catch(err => {
                reject(err);
            });
    });
}

const fetchAccountTokenBalance = (contractAddress, address, network) =>
    new Promise((resolve, reject) => {
        const contract = new Contract(CONTRACT_ABI);
        const requestData = processRequest('eth_call', [
            { to: contractAddress, data: contract.methods.balanceOf(address).encodeABI() },
            'latest',
        ]);
        console.log('[AION get token balance req]:', getEndpoint(network));

        ApiCaller.post(getEndpoint(network), requestData, true)
            .then(res => {
                if (res.data.result) {
                    resolve(BigNumber(AbiCoder.decodeParameter('uint128', res.data.result)));
                } else {
                    reject(`get account Balance failed:${res.data.error}`);
                }
            })
            .catch(e => {
                reject(`get account Balance failed:${e}`);
            });
    });

const fetchTokenDetail = (contractAddress, network) =>
    new Promise((resolve, reject) => {
        const contract = new Contract(CONTRACT_ABI);
        const requestGetSymbol = processRequest('eth_call', [
            { to: contractAddress, data: contract.methods.symbol().encodeABI() },
            'latest',
        ]);
        const requestGetName = processRequest('eth_call', [
            { to: contractAddress, data: contract.methods.name().encodeABI() },
            'latest',
        ]);
        const requestGetDecimals = processRequest('eth_call', [
            { to: contractAddress, data: contract.methods.decimals().encodeABI() },
            'latest',
        ]);
        const url = getEndpoint(network);
        const promiseSymbol = ApiCaller.post(url, requestGetSymbol, true);
        const promiseName = ApiCaller.post(url, requestGetName, true);
        const promiseDecimals = ApiCaller.post(url, requestGetDecimals, true);
        console.log('[AION get token detail req]:', getEndpoint(network));
        axios
            .all([promiseSymbol, promiseName, promiseDecimals])
            .then(
                axios.spread((symbolRet, nameRet, decimalsRet) => {
                    if (symbolRet.data.result && nameRet.data.result && decimalsRet.data.result) {
                        console.log('[get token symobl resp]=>', symbolRet.data);
                        console.log('[get token name resp]=>', nameRet.data);
                        console.log('[get token decimals resp]=>', decimalsRet.data);
                        let symbol;
                        let name;
                        try {
                            symbol = AbiCoder.decodeParameter('string', symbolRet.data.result);
                        } catch (e) {
                            symbol = hexToAscii(symbolRet.data.result);
                            symbol = symbol.slice(0, symbol.indexOf('\u0000'));
                        }
                        try {
                            name = AbiCoder.decodeParameter('string', nameRet.data.result);
                        } catch (e) {
                            name = hexToAscii(nameRet.data.result);
                            name = name.slice(0, name.indexOf('\u0000'));
                        }
                        const decimals = AbiCoder.decodeParameter('uint8', decimalsRet.data.result);
                        resolve({ contractAddr: contractAddress, symbol, name, decimals });
                    } else {
                        reject('get token detail failed');
                    }
                }),
            )
            .catch(e => {
                reject(`get token detail failed${e}`);
            });
    });

function fetchAccountTokenTransferHistory(address, symbolAddress, network, page = 0, size = 25) {
    return new Promise((resolve, reject) => {
        const url = `https://${network}-api.aion.network/aion/dashboard/getTransactionsByAddress?accountAddress=${address.toLowerCase()}&tokenAddress=${symbolAddress.toLowerCase()}&page=${page}&size=${size}`;
        console.log(`get account token transactions: ${url}`);
        ApiCaller.get(url)
            .then(res => {
                const { content } = res;
                const txs = {};
                content.forEach(t => {
                    const tx = {};
                    tx.hash = `0x${t.transactionHash}`;
                    tx.timestamp = t.transferTimestamp * 1000;
                    tx.from = `0x${t.fromAddr}`;
                    tx.to = `0x${t.toAddr}`;
                    tx.value = BigNumber(t.tknValue, 10).toNumber();
                    tx.status = 'CONFIRMED';
                    tx.blockNumber = t.blockNumber;
                    txs[tx.hash] = tx;
                });
                resolve(txs);
            })
            .catch(err => {
                reject(err);
            });
    });
}

const getTopTokens = (topN = 20) => {
    return new Promise((resolve, reject) => {
        const url = `${app_server_api}/token/aion?offset=0&limit=${topN}`;
        console.log(`get top aion tokens: ${url}`);
        ApiCaller.get(url, false)
            .then(res => {
                resolve(res.data);
            })
            .catch(err => {
                console.log('get keystore top tokens error:', err);
                reject(err);
            });
    });
};

const searchTokens = keyword => {
    return new Promise((resolve, reject) => {
        const url = `${app_server_api}/token/aion/search?keyword=${keyword}`;
        console.log(`search aion token: ${url}`);
        ApiCaller.get(url, false)
            .then(res => {
                resolve(res.data);
            })
            .catch(err => {
                console.log('search keystore token error:', err);
                reject(err);
            });
    });
};

export {
    fetchAccountTokens,
    fetchAccountTokenBalance,
    fetchAccountTokenTransferHistory,
    fetchTokenDetail,
    getTopTokens,
    searchTokens,
}