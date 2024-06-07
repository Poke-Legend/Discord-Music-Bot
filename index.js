const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const fs = require('fs');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    getVoiceConnection
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
const lastNowPlaying = new Map();
const lastAddedToQueue = new Map();
const lastUpNext = new Map();

player.on('error', error => {
    console.error('Player Error:', error.message);
    if (error.resource && error.resource.metadata) {
        console.error('with resource', error.resource.metadata);
    }
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
        await deleteLastEmbeds(guildId);
        clearQueueFile();
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Stopped')
            .setDescription('The queue is empty, so the music has stopped playing.');
        const msg = await textChannel.send({ embeds: [embed] });

        setTimeout(async () => {
            await deleteMessage(msg);
        }, 15000);

        return;
    }

    const url = queue[0];
    if (!ytdl.validateURL(url)) {
        console.error('Invalid URL:', url);
        queue.shift();
        saveQueue();
        await playSong(guildId, textChannel);
        return;
    }

    let stream;
    try {
        stream = ytdl(url, { filter: 'audioonly', highWaterMark: 1 << 25 });
    } catch (error) {
        console.error('Stream error:', error);
        if (retry < 3) {
            console.log(`Retrying... (${retry + 1})`);
            await playSong(guildId, textChannel, retry + 1);
        } else {
            queue.shift();
            saveQueue();
            await playSong(guildId, textChannel);
        }
        return;
    }

    const resource = createAudioResource(stream, { inlineVolume: true });
    let info;
    try {
        info = await ytdl.getInfo(url);
    } catch (error) {
        console.error('Error getting video info:', error);
        if (retry < 3) {
            console.log(`Retrying info fetch... (${retry + 1})`);
            await playSong(guildId, textChannel, retry + 1);
        } else {
            queue.shift();
            saveQueue();
            await playSong(guildId, textChannel);
        }
        return;
    }

    const title = info.videoDetails.title;
    const thumbnailUrl = info.videoDetails.thumbnails[0].url;

    player.play(resource);
    console.log(`Playing song: ${title}`);

    player.once(AudioPlayerStatus.Idle, async () => {
        await deleteMessage(lastAddedToQueue.get(guildId));
        queue.shift();
        saveQueue();
        await playSong(guildId, textChannel);
    });

    if (textChannel) {
        await deleteMessage(lastNowPlaying.get(guildId));
        await deleteMessage(lastUpNext.get(guildId));

        const embed = new Discord.MessageEmbed()
            .setColor('#00ff00')
            .setTitle('Now Playing')
            .setDescription(title)
            .setThumbnail(thumbnailUrl);

        const nowPlayingMessage = await textChannel.send({ embeds: [embed] });
        lastNowPlaying.set(guildId, nowPlayingMessage);

        if (queue[1]) {
            let nextInfo;
            try {
                nextInfo = await ytdl.getInfo(queue[1]);
            } catch (error) {
                console.error('Error getting next video info:', error);
                return;
            }
            const nextTitle = nextInfo.videoDetails.title;
            const nextEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Up Next')
                .setDescription(nextTitle);
            const upNextMessage = await textChannel.send({ embeds: [nextEmbed] });
            lastUpNext.set(guildId, upNextMessage);
        }
    }
}

async function deleteMessage(message) {
    if (!message) return;
    try {
        await message.delete();
    } catch (error) {
        if (error.code === 10008) {
            // Ignore the specific "Unknown Message" error
        } else {
            console.error('Error deleting message:', error);
        }
    }
}

async function deleteLastEmbeds(guildId) {
    await deleteMessage(lastNowPlaying.get(guildId));
    await deleteMessage(lastAddedToQueue.get(guildId));
    await deleteMessage(lastUpNext.get(guildId));
    lastNowPlaying.delete(guildId);
    lastAddedToQueue.delete(guildId);
    lastUpNext.delete(guildId);
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadQueue();
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

        if (args.length === 0 || !ytdl.validateURL(args[0])) {
            const embed = new Discord.MessageEmbed()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('You need to provide a valid YouTube URL!');
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
        saveQueue();

        let info;
        try {
            info = await ytdl.getInfo(args[0]);
        } catch (error) {
            console.error('Error getting video info:', error);
            return;
        }
        const title = info.videoDetails.title;

        await deleteMessage(lastAddedToQueue.get(message.guild.id));

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Song Added to Queue')
            .setDescription(title);
        const addedToQueueMessage = await message.channel.send({ embeds: [embed] });
        lastAddedToQueue.set(message.guild.id, addedToQueueMessage);
        try {
            await message.delete();
        } catch (error) {
            if (error.code !== 10008) {
                console.error('Error deleting message:', error);
            }
        }

        if (queue.length === 1) {
            await playSong(message.guild.id, message.channel);
        } else if (queue.length === 2) {
            let nextInfo;
            try {
                nextInfo = await ytdl.getInfo(queue[1]);
            } catch (error) {
                console.error('Error getting next video info:', error);
                return;
            }
            const nextTitle = nextInfo.videoDetails.title;
            const nextEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Up Next')
                .setDescription(nextTitle);
            const upNextMessage = await message.channel.send({ embeds: [nextEmbed] });
            lastUpNext.set(message.guild.id, upNextMessage);
        }
    } else if (command === 'stop') {
        const connection = getVoiceConnection(message.guild.id);
        if (connection) {
            connection.destroy();
        }
        queues.delete(message.guild.id);
        saveQueue();

        await deleteLastEmbeds(message.guild.id);

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Stopped')
            .setDescription('The music has been stopped and the queue has been cleared.');
        const msg = await message.channel.send({ embeds: [embed] });

        setTimeout(async () => {
            await deleteMessage(msg);
        }, 15000);

        try {
            await message.delete();
        } catch (error) {
            if (error.code !== 10008) {
                console.error('Error deleting message:', error);
            }
        }
    } else if (command === 'pause') {
        if (player.state.status !== AudioPlayerStatus.Paused) {
            player.pause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Paused')
            .setDescription('The music has been paused.');
        await message.channel.send({ embeds: [embed] });
        try {
            await message.delete();
        } catch (error) {
            if (error.code !== 10008) {
                console.error('Error deleting message:', error);
            }
        }
    } else if (command === 'resume') {
        if (player.state.status === AudioPlayerStatus.Paused) {
            player.unpause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Resumed')
            .setDescription('The music has been resumed.');
        await message.channel.send({ embeds: [embed] });
        try {
            await message.delete();
        } catch (error) {
            if (error.code !== 10008) {
                console.error('Error deleting message:', error);
            }
        }
    } else if (command === 'skip') {
        const queue = queues.get(message.guild.id);
        if (queue && queue.length > 0) {
            player.stop();
            const embed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Song Skipped')
                .setDescription('The current song has been skipped.');
            const msg = await message.channel.send({ embeds: [embed] });

            setTimeout(async () => {
                await deleteMessage(msg);
            }, 5000);

        } else {
            const embed = new Discord.MessageEmbed()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('There are no songs in the queue to skip.');
            await message.channel.send({ embeds: [embed] });
        }
        try {
            await message.delete();
        } catch (error) {
            if (error.code !== 10008) {
                console.error('Error deleting message:', error);
            }
        }
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
        setTimeout(async () => {
            await deleteMessage(helpMessage);
        }, 10000);
    }
});

client.login(process.env.DISCORD_TOKEN);
