const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const fs = require('fs');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    getVoiceConnection,
    VoiceConnectionStatus
} = require('@discordjs/voice');
require('dotenv').config();

const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_VOICE_STATES
    ]
});

const player = createAudioPlayer();
const queues = new Map();
const lastNowPlaying = new Map(); // To track the last "Now Playing" message for each guild
const lastAddedToQueue = new Map(); // To track the last "Song Added to Queue" message for each guild
const lastUpNext = new Map(); // To track the last "Up Next" message for each guild

player.on('error', error => {
    console.error('Error:', error.message, 'with resource', error.resource.metadata);
});

function saveQueue() {
    const queueData = {};
    queues.forEach((queue, guildId) => {
        queueData[guildId] = queue;
    });
    fs.writeFileSync('queue.json', JSON.stringify(queueData, null, 2));
}

function clearQueueFile() {
    fs.writeFileSync('queue.json', JSON.stringify({}, null, 2));
}

function loadQueue() {
    if (fs.existsSync('queue.json')) {
        const data = fs.readFileSync('queue.json');
        const queueData = JSON.parse(data);
        for (const guildId in queueData) {
            queues.set(guildId, queueData[guildId]);
        }
    }
}

async function playSong(guildId, textChannel, retry = 0) {
    const queue = queues.get(guildId);
    if (!queue || queue.length === 0) {
        await deleteLastEmbeds(guildId); // Delete the last remaining embeds
        clearQueueFile(); // Clear the queue file when there are no more songs
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Stopped')
            .setDescription('The queue is empty, so the music has stopped playing.');
        const msg = await textChannel.send({ embeds: [embed] });

        // Remove "Music Stopped" embed after 15 seconds
        setTimeout(async () => {
            try {
                await msg.delete();
            } catch (error) {
                console.error('Error deleting "Music Stopped" message:', error);
            }
        }, 15000);

        return;
    }

    const url = queue[0];
    let stream;
    try {
        stream = ytdl(url, { filter: 'audioonly' });
    } catch (error) {
        console.error('Stream error:', error);
        if (retry < 3) {
            console.log(`Retrying... (${retry + 1})`);
            playSong(guildId, textChannel, retry + 1);
        } else {
            queue.shift(); // Skip the problematic song
            saveQueue();
            playSong(guildId, textChannel);
        }
        return;
    }

    const resource = createAudioResource(stream);
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const thumbnailUrl = info.videoDetails.thumbnails[0].url; // Get the first thumbnail URL

    player.play(resource);

    player.once(AudioPlayerStatus.Idle, async () => {
        if (lastAddedToQueue.has(guildId)) {
            const lastMessage = lastAddedToQueue.get(guildId);
            try {
                if (lastMessage) await lastMessage.delete();
            } catch (error) {
                if (error.code !== 10008) {
                    console.error('Error deleting last "Song Added to Queue" message:', error);
                }
            }
        }

        queue.shift();
        saveQueue();
        playSong(guildId, textChannel);
    });

    if (textChannel) {
        if (lastNowPlaying.has(guildId)) {
            const lastMessage = lastNowPlaying.get(guildId);
            try {
                if (lastMessage) await lastMessage.delete();
            } catch (error) {
                if (error.code !== 10008) {
                    console.error('Error deleting last "Now Playing" message:', error);
                }
            }
        }

        if (lastUpNext.has(guildId)) {
            const lastUpNextMessage = lastUpNext.get(guildId);
            try {
                if (lastUpNextMessage) await lastUpNextMessage.delete();
            } catch (error) {
                if (error.code !== 10008) {
                    console.error('Error deleting last "Up Next" message:', error);
                }
            }
            lastUpNext.delete(guildId);
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#00ff00') // Green color
            .setTitle('Now Playing')
            .setDescription(title)
            .setThumbnail(thumbnailUrl); // Set the thumbnail image

        const nowPlayingMessage = await textChannel.send({ embeds: [embed] });
        lastNowPlaying.set(guildId, nowPlayingMessage); // Track the last "Now Playing" message

        if (queue[1]) {
            const nextInfo = await ytdl.getInfo(queue[1]);
            const nextTitle = nextInfo.videoDetails.title;
            const nextEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Up Next')
                .setDescription(nextTitle);
            const upNextMessage = await textChannel.send({ embeds: [nextEmbed] });
            lastUpNext.set(guildId, upNextMessage); // Track the last "Up Next" message
        }
    }
}

async function deleteLastEmbeds(guildId) {
    try {
        if (lastNowPlaying.has(guildId)) {
            const lastMessage = lastNowPlaying.get(guildId);
            if (lastMessage) await lastMessage.delete();
            lastNowPlaying.delete(guildId);
        }
        if (lastAddedToQueue.has(guildId)) {
            const lastMessage = lastAddedToQueue.get(guildId);
            if (lastMessage) await lastMessage.delete();
            lastAddedToQueue.delete(guildId);
        }
        if (lastUpNext.has(guildId)) {
            const lastMessage = lastUpNext.get(guildId);
            if (lastMessage) await lastMessage.delete();
            lastUpNext.delete(guildId);
        }
    } catch (error) {
        if (error.code !== 10008) {
            console.error('Error deleting last embed message:', error);
        }
    }
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadQueue(); // Load the queue from the JSON file when the bot starts
});

client.once('reconnecting', () => {
    console.log('Reconnecting!');
});

client.once('disconnect', () => {
    console.log('Disconnect!');
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(process.env.PREFIX)) return;

    const args = message.content.substring(process.env.PREFIX.length).split(' ');
    const command = args.shift().toLowerCase();

    if (command === 'play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            const embed = new Discord.MessageEmbed()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('You need to be in a voice channel to play music!');
            await message.channel.send({ embeds: [embed] });
            return;
        }

        if (args.length === 0) {
            const embed = new Discord.MessageEmbed()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('You need to provide a YouTube URL!');
            await message.channel.send({ embeds: [embed] });
            return;
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        });

        connection.subscribe(player);

        let queue = queues.get(message.guild.id);
        if (!queue) {
            queue = [];
            queues.set(message.guild.id, queue);
        }

        queue.push(args[0]);
        saveQueue(); // Save the queue to the JSON file

        const info = await ytdl.getInfo(args[0]);
        const title = info.videoDetails.title;

        if (lastAddedToQueue.has(message.guild.id)) {
            const lastMessage = lastAddedToQueue.get(message.guild.id);
            try {
                if (lastMessage) await lastMessage.delete();
            } catch (error) {
                if (error.code !== 10008) {
                    console.error('Error deleting last "Song Added to Queue" message:', error);
                }
            }
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Song Added to Queue')
            .setDescription(title);
        const addedToQueueMessage = await message.channel.send({ embeds: [embed] });
        lastAddedToQueue.set(message.guild.id, addedToQueueMessage); // Track the last "Song Added to Queue" message
        message.delete().catch(console.error);

        if (queue.length === 1) {
            playSong(message.guild.id, message.channel);
        } else if (queue.length === 2) { // If the new song is the second in the queue
            const nextInfo = await ytdl.getInfo(queue[1]);
            const nextTitle = nextInfo.videoDetails.title;
            const nextEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Up Next')
                .setDescription(nextTitle);
            const upNextMessage = await message.channel.send({ embeds: [nextEmbed] });
            lastUpNext.set(message.guild.id, upNextMessage); // Track the last "Up Next" message
        }
    } else if (command === 'stop') {
        const connection = getVoiceConnection(message.guild.id);
        if (connection) {
            connection.destroy();
        }
        queues.delete(message.guild.id);
        saveQueue(); // Save the empty queue to the JSON file

        // Directly handle deletion of embeds here
        await deleteLastEmbeds(message.guild.id);

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Stopped')
            .setDescription('The music has been stopped and the queue has been cleared.');
        const msg = await message.channel.send({ embeds: [embed] });

        // Remove "Music Stopped" embed after 15 seconds
        setTimeout(async () => {
            try {
                await msg.delete();
            } catch (error) {
                console.error('Error deleting "Music Stopped" message:', error);
            }
        }, 15000);

        message.delete().catch(console.error);
    } else if (command === 'pause') {
        if (player.state.status !== AudioPlayerStatus.Paused) {
            player.pause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Paused')
            .setDescription('The music has been paused.');
        await message.channel.send({ embeds: [embed] });
        message.delete().catch(console.error);
    } else if (command === 'resume') {
        if (player.state.status === AudioPlayerStatus.Paused) {
            player.unpause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Resumed')
            .setDescription('The music has been resumed.');
        await message.channel.send({ embeds: [embed] });
        message.delete().catch(console.error);
    } else if (command === 'skip') {
        const queue = queues.get(message.guild.id);
        if (queue && queue.length > 0) {
            player.stop(); // Stop the current song, triggering the player to move to the next song
            const embed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Song Skipped')
                .setDescription('The current song has been skipped.');
            const msg = await message.channel.send({ embeds: [embed] });

            // Remove "Song Skipped" embed after 5 seconds
            setTimeout(async () => {
                try {
                    await msg.delete();
                } catch (error) {
                    console.error('Error deleting "Song Skipped" message:', error);
                }
            }, 5000);

        } else {
            const embed = new Discord.MessageEmbed()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('There are no songs in the queue to skip.');
            await message.channel.send({ embeds: [embed] });
        }
        message.delete().catch(console.error);
    } else if (command === 'help') {
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Bot Commands')
            .setDescription('Here are the commands you can use with the music bot:')
            .addFields(
                { name: `${process.env.PREFIX}play [url]`, value: 'Add a song from YouTube to the queue.' },
                { name: `${process.env.PREFIX}stop`, value: 'Stop the currently playing song and clear the queue.' },
                { name: `${process.env.PREFIX}pause`, value: 'Pause the currently playing song.' },
                { name: `${process.env.PREFIX}resume`, value: 'Resume the currently playing song.' },
                { name: `${process.env.PREFIX}skip`, value: 'Skip to the next song in the queue.' }
            );

        const helpMessage = await message.channel.send({ embeds: [embed] });
        setTimeout(() => helpMessage.delete().catch(console.error), 10000);
    }
});

client.login(process.env.DISCORD_TOKEN);
