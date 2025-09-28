const Room = require('../models/room');
const { sendToPlayersData } = require('../socket/emits');

// Queue to prevent parallel saves of the same document
const saveQueues = new Map();

const getRoom = async roomId => {
    return await Room.findOne({ _id: roomId }).exec();
};

const getRooms = async () => {
    return await Room.find().exec();
};

const updateRoom = async room => {
    const roomId = room._id.toString();

    // If there's already a save operation for this room, queue this one
    if (saveQueues.has(roomId)) {
        return new Promise((resolve, reject) => {
            saveQueues.get(roomId).push({ room, resolve, reject });
        });
    }

    // Create a new queue for this room
    saveQueues.set(roomId, []);

    try {
        const result = await performSave(room);
        await processQueue(roomId);
        return result;
    } catch (error) {
        saveQueues.delete(roomId);
        throw error;
    }
};

const performSave = async room => {
    try {
        return await room.save();
    } catch (error) {
        if (error.name === 'VersionError') {
            console.log('Version conflict detected, retrying with fresh data...');
            // Get fresh room data and retry
            const freshRoom = await Room.findById(room._id);
            if (freshRoom) {
                // Apply the same changes to fresh room
                Object.assign(freshRoom, room.toObject());
                return await freshRoom.save();
            }
        }
        throw error;
    }
};

const processQueue = async roomId => {
    const queue = saveQueues.get(roomId);
    if (!queue || queue.length === 0) {
        saveQueues.delete(roomId);
        return;
    }

    const { room, resolve, reject } = queue.shift();

    try {
        const result = await performSave(room);
        resolve(result);
        await processQueue(roomId); // Process next in queue
    } catch (error) {
        reject(error);
        saveQueues.delete(roomId); // Clear queue on error
    }
};

const getJoinableRoom = async () => {
    return await Room.findOne({ full: false, started: false }).exec();
};

const createNewRoom = async data => {
    const room = new Room(data);
    await room.save();
    return room;
};

const deleteRoom = async roomId => {
    try {
        const result = await Room.findByIdAndDelete(roomId);
        console.log(`Room ${roomId} deleted successfully`);
        return result;
    } catch (error) {
        console.error(`Error deleting room ${roomId}:`, error);
        throw error;
    }
};

const cleanupFinishedRooms = async () => {
    try {
        // Delete rooms that have been finished for more than 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const result = await Room.deleteMany({
            winner: { $ne: null },
            updatedAt: { $lt: fiveMinutesAgo },
        });

        if (result.deletedCount > 0) {
            console.log(`Cleaned up ${result.deletedCount} finished rooms`);
        }
        return result;
    } catch (error) {
        console.error('Error cleaning up finished rooms:', error);
    }
};

Room.watch().on('change', async data => {
    sendToPlayersData(await getRoom(data.documentKey._id));
});

module.exports = { getRoom, getRooms, updateRoom, getJoinableRoom, createNewRoom, deleteRoom, cleanupFinishedRooms };
