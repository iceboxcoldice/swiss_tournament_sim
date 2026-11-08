// worker.js - Background Web Worker for Tournament Simulator
importScripts('simulation.js');

self.onmessage = async function (e) {
    const { id, type, params } = e.data;

    if (params && params.seed !== undefined) {
        setSeed(params.seed);
    }

    const progressCallback = (current, total) => {
        self.postMessage({ id, type: 'PROGRESS', current, total });
    };

    try {
        let result;
        switch (type) {
            case 'HEAD_TO_HEAD':
                result = await runHeadToHeadSimulation(params, progressCallback);
                break;
            case 'TOP_N':
                result = await runTopNSimulation(params, progressCallback);
                break;
            case 'WIN_DIST':
                result = await runWinDistSimulation(params, progressCallback);
                break;
            case 'RANK_FROM_WINS':
                result = await runRankFromWinsSimulation(params, progressCallback);
                break;
            case 'RANK_FROM_HISTORY':
                result = await runRankFromHistorySimulation(params, progressCallback);
                break;
            case 'TOP_N_HISTORY':
                result = await runTopNFromHistorySimulation(params, progressCallback);
                break;
            default:
                throw new Error(`Unknown simulation type: ${type}`);
        }
        self.postMessage({ id, type: 'COMPLETE', result });
    } catch (error) {
        self.postMessage({ id, type: 'ERROR', error: error.message });
    }
};
