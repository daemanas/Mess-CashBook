const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const MealUser = require('../models/mealUser');
const controller = require('../controller/userController');

function query(value) {
    return {
        select() { return this; },
        sort() { return this; },
        lean() { return Promise.resolve(value); }
    };
}

function response() {
    return {
        statusCode: 200,
        rendered: null,
        redirected: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        render(view, locals) {
            this.rendered = { view, locals };
            return this;
        },
        redirect(url) {
            this.redirected = url;
            return this;
        }
    };
}

function sessionUser(id, role = 'admin') {
    return { id: String(id), role, groupId: 'group-one' };
}

test('admin meal creation associates an explicitly selected in-group member and validates the whole count', async () => {
    const adminId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    const originals = {
        findById: User.findById,
        find: User.find,
        mealFindOne: MealUser.findOne,
        mealFind: MealUser.find,
        mealCreate: MealUser.create
    };
    const created = [];
    let memberFilter;
    User.findById = () => query({
        _id: adminId,
        role: 'admin',
        groupId: 'group-one',
        isVerified: true
    });
    User.find = filter => {
        memberFilter = filter;
        return query([{ _id: memberId, name: 'Asha' }]);
    };
    MealUser.findOne = async () => null;
    MealUser.find = () => ({
        sort() { return this; },
        limit() { return Promise.resolve([]); }
    });
    MealUser.create = async values => {
        const ledger = {
            ...values,
            meals: [],
            async save() { created.push({ ...this, meals: [...this.meals] }); }
        };
        created.push(ledger);
        return ledger;
    };

    try {
        const res = response();
        await controller.postAddMeal({
            session: { user: sessionUser(adminId) },
            body: {
                name: 'Asha',
                memberId: String(memberId),
                entry_date: '2026-02-14',
                food_count: '3'
            }
        }, res, error => { throw error; });

        assert.deepEqual(memberFilter, {
            groupId: 'group-one',
            isVerified: true,
            role: { $in: ['admin', 'member'] }
        });
        assert.equal(created[0].name, 'asha');
        assert.equal(String(created[0].memberId), String(memberId));
        assert.equal(created[0].meals[0].food_count, 3);
        assert.equal(created[0].meals[0].date.getDate(), 14);
        assert.equal(res.redirected, '/AddedMeal?saved=1');
    } finally {
        User.findById = originals.findById;
        User.find = originals.find;
        MealUser.findOne = originals.mealFindOne;
        MealUser.find = originals.mealFind;
        MealUser.create = originals.mealCreate;
    }
});

test('meal creation rejects a member session and fractional meal counts', async () => {
    const adminId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    const originals = {
        findById: User.findById,
        find: User.find,
        mealFindOne: MealUser.findOne,
        mealFind: MealUser.find,
        mealCreate: MealUser.create
    };
    User.findById = () => query({
        _id: adminId,
        role: 'admin',
        groupId: 'group-one',
        isVerified: true
    });
    User.find = () => query([{ _id: memberId, name: 'Asha' }]);
    MealUser.findOne = async () => null;
    MealUser.find = () => ({
        sort() { return this; },
        limit() { return Promise.resolve([]); }
    });
    MealUser.create = async () => {
        throw new Error('Meal ledger must not be created for an invalid count.');
    };

    try {
        const memberResponse = response();
        await controller.postAddMeal({
            session: { user: sessionUser(memberId, 'member') },
            body: { name: 'Asha', memberId: String(memberId), entry_date: '2026-02-14', food_count: '2' }
        }, memberResponse, error => { throw error; });
        assert.equal(memberResponse.statusCode, 403);

        const outsiderResponse = response();
        await controller.postAddMeal({
            session: { user: sessionUser(adminId) },
            body: {
                name: 'Asha',
                memberId: String(new mongoose.Types.ObjectId()),
                entry_date: '2026-02-14',
                food_count: '2'
            }
        }, outsiderResponse, error => { throw error; });
        assert.equal(outsiderResponse.statusCode, 400);
        assert.match(outsiderResponse.rendered.locals.error, /registered member/);

        const invalidCountResponse = response();
        await controller.postAddMeal({
            session: { user: sessionUser(adminId) },
            body: { name: 'Asha', memberId: String(memberId), entry_date: '2026-02-14', food_count: '1.5' }
        }, invalidCountResponse, error => { throw error; });
        assert.equal(invalidCountResponse.statusCode, 400);
        assert.match(invalidCountResponse.rendered.locals.error, /whole number/);
    } finally {
        User.findById = originals.findById;
        User.find = originals.find;
        MealUser.findOne = originals.mealFindOne;
        MealUser.find = originals.mealFind;
        MealUser.create = originals.mealCreate;
    }
});

test('an admin cannot demote the last verified group admin', async () => {
    const adminId = new mongoose.Types.ObjectId();
    const otherAdminId = new mongoose.Types.ObjectId();
    const originals = {
        findById: User.findById,
        findOne: User.findOne,
        countDocuments: User.countDocuments,
        updateOne: User.updateOne
    };
    let updateAttempted = false;
    User.findById = () => query({
        _id: adminId,
        role: 'admin',
        groupId: 'group-one',
        isVerified: true
    });
    User.findOne = async () => ({ _id: otherAdminId });
    User.countDocuments = async () => 1;
    User.updateOne = async () => {
        updateAttempted = true;
        return { modifiedCount: 1 };
    };

    try {
        const res = response();
        await controller.removeAdminRole({
            session: { user: sessionUser(adminId) },
            params: { id: String(otherAdminId) }
        }, res, error => { throw error; });

        assert.equal(res.statusCode, 403);
        assert.match(res.rendered.locals.message, /last group admin/i);
        assert.equal(updateAttempted, false);
    } finally {
        User.findById = originals.findById;
        User.findOne = originals.findOne;
        User.countDocuments = originals.countDocuments;
        User.updateOne = originals.updateOne;
    }
});

test('admins can promote a group member and demote another admin without changing group membership', async () => {
    const adminId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    const otherAdminId = new mongoose.Types.ObjectId();
    const originals = {
        findById: User.findById,
        findOne: User.findOne,
        countDocuments: User.countDocuments,
        updateOne: User.updateOne
    };
    const updates = [];
    User.findById = () => query({
        _id: adminId,
        role: 'admin',
        groupId: 'group-one',
        isVerified: true
    });
    User.findOne = async filter => {
        assert.equal(filter.groupId, 'group-one');
        return { _id: otherAdminId };
    };
    User.countDocuments = async filter => {
        assert.equal(filter.groupId, 'group-one');
        return 2;
    };
    User.updateOne = async (filter, update) => {
        updates.push({ filter, update });
        return { modifiedCount: 1 };
    };

    try {
        const promoteResponse = response();
        await controller.makeAdmin({
            session: { user: sessionUser(adminId) },
            params: { id: String(memberId) }
        }, promoteResponse, error => { throw error; });
        assert.equal(promoteResponse.redirected, '/settings/members?updated=1');

        const demoteResponse = response();
        await controller.removeAdminRole({
            session: { user: sessionUser(adminId) },
            params: { id: String(otherAdminId) }
        }, demoteResponse, error => { throw error; });
        assert.equal(demoteResponse.redirected, '/settings/members?updated=1');

        assert.deepEqual(updates.map(item => item.filter), [
            { _id: String(memberId), groupId: 'group-one', isVerified: true, role: 'member' },
            { _id: otherAdminId, groupId: 'group-one', isVerified: true, role: 'admin' }
        ]);
        assert.deepEqual(updates.map(item => item.update), [
            { $set: { role: 'admin' } },
            { $set: { role: 'member' } }
        ]);
    } finally {
        User.findById = originals.findById;
        User.findOne = originals.findOne;
        User.countDocuments = originals.countDocuments;
        User.updateOne = originals.updateOne;
    }
});
