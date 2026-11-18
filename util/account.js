const mongoose = require('mongoose');

const MESS_ROLES = ['admin', 'member'];

function isMessAccount(user) {
    return Boolean(user) && MESS_ROLES.includes(user.role) && Boolean(user.groupId);
}

function accountId(user) {
    const id = user && (user.id || user._id);
    if (!id) throw new Error('Authenticated user ID is unavailable');
    return new mongoose.Types.ObjectId(String(id));
}

/**
 * Read filter. Migrated group records are matched by groupId exactly as before;
 * personal records are matched by the user reference only, never by "groupId: null"
 * (which in MongoDB also matches every other personal user's rows).
 */
function getAccountScope(user) {
    if (isMessAccount(user)) {
        return { groupId: user.groupId };
    }
    return { user: accountId(user) };
}

/** Ownership written onto new records. */
function getRecordOwnership(user) {
    const userId = accountId(user);
    if (isMessAccount(user)) {
        return { groupId: user.groupId, user: userId };
    }
    // Explicit null keeps personal rows out of any group query.
    return { groupId: null, user: userId };
}

function buildAccountView(user) {
    const isMess = isMessAccount(user);
    return {
        isLoggedIn: Boolean(user),
        isMess,
        isPersonal: Boolean(user) && !isMess,
        isAdmin: Boolean(user) && user.role === 'admin' && Boolean(user.groupId),
        role: user ? user.role : null,
        groupId: user ? user.groupId : null,
        messName: user ? user.messName || null : null,
        displayName: user && user.name ? user.name : ''
    };
}

module.exports = {
    isMessAccount,
    getAccountScope,
    getRecordOwnership,
    buildAccountView,
    accountId
};
