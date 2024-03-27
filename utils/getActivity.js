let isStreaming = false;

module.exports = {
    getIsStreaming: () => isStreaming,
    setIsStreaming: (state) => { isStreaming = state; },
};