module.exports = function generateGroupId() {
    return 'CB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
};
