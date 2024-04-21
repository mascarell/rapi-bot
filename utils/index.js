const getFiles = require('./getFiles');
const { getIsStreaming, setIsStreaming } = require('./getActivity');
const getRapiMessages = require("./getRapiMessages");
const { getBosses, getBossesLinks, getTribeTowerRotation, getBossFileName } = require("./getDailyInterceptionConfig");
const gamesData = require('./data/gamesData');

module.exports = {
	getFiles,
    getIsStreaming,
    setIsStreaming,
    getRapiMessages,
    getBosses,
    getBossesLinks,
    getTribeTowerRotation,
    getBossFileName,
    gamesData
}
