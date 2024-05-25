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

async function playSong(guildId, textChannel) {
    const queue = queues.get(guildId);
    if (!queue || queue.length === 0) {
        clearQueueFile(); // Clear the queue file when there are no more songs
        return;
    }

    const url = queue[0];
    const stream = ytdl(url, { filter: 'audioonly' });
    const resource = createAudioResource(stream);
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const thumbnailUrl = info.videoDetails.thumbnails[0].url; // Get the first thumbnail URL

    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
        queue.shift();
        saveQueue();
        playSong(guildId, textChannel);
    });

    if (textChannel) {
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Now Playing')
            .setDescription(title)
            .setThumbnail(thumbnailUrl); // Set the thumbnail image
        textChannel.send({ embeds: [embed] });

        if (queue[1]) {
            const nextInfo = await ytdl.getInfo(queue[1]);
            const nextTitle = nextInfo.videoDetails.title;
            const nextEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Up Next')
                .setDescription(nextTitle);
            textChannel.send({ embeds: [nextEmbed] });
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
            message.channel.send({ embeds: [embed] });
            return;
        }

        if (args.length === 0) {
            const embed = new Discord.MessageEmbed()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('You need to provide a YouTube URL!');
            message.channel.send({ embeds: [embed] });
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

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Song Added to Queue')
            .setDescription(title);
        message.channel.send({ embeds: [embed] });
        message.delete().catch(console.error);

        if (queue.length === 1) {
            playSong(message.guild.id, message.channel);
        }
    } else if (command === 'stop') {
        const connection = getVoiceConnection(message.guild.id);
        if (connection) {
            connection.destroy();
        }
        queues.delete(message.guild.id);
        saveQueue(); // Save the empty queue to the JSON file

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Stopped')
            .setDescription('The music has been stopped and the queue has been cleared.');
        message.channel.send({ embeds: [embed] });
        message.delete().catch(console.error);
    } else if (command === 'pause') {
        if (player.state.status !== AudioPlayerStatus.Paused) {
            player.pause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Paused')
            .setDescription('The music has been paused.');
        message.channel.send({ embeds: [embed] });
        message.delete().catch(console.error);
    } else if (command === 'resume') {
        if (player.state.status === AudioPlayerStatus.Paused) {
            player.unpause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Resumed')
            .setDescription('The music has been resumed.');
        message.channel.send({ embeds: [embed] });
        message.delete().catch(console.error);
    } else if (command === 'skip') {
        const queue = queues.get(message.guild.id);
        if (queue && queue.length > 0) {
            player.stop(); // Stop the current song, triggering the player to move to the next song
            const embed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Song Skipped')
                .setDescription('The current song has been skipped.');
            message.channel.send({ embeds: [embed] });
        } else {
            const embed = new Discord.MessageEmbed()
                .setColor('#ff0000')
                .setTitle('Error')
                .setDescription('There are no songs in the queue to skip.');
            message.channel.send({ embeds: [embed] });
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
