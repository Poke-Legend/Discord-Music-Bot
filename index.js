const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    getVoiceConnection,
    entersState
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

async function playSong(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.length === 0) {
        return;
    }

    const url = queue[0];
    const stream = ytdl(url, { filter : 'audioonly' });
    const resource = createAudioResource(stream);

    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
        queue.shift();
        playSong(guildId);
    });

    const channel = client.channels.cache.get(guildId);
    if (channel) {
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Now Playing')
            .setDescription(`[${url}](${url})`);
        channel.send({ embeds: [embed] });

        if (queue[1]) {
            const nextEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Up Next')
                .setDescription(`[${queue[1]}](${queue[1]})`);
            channel.send({ embeds: [nextEmbed] });
        }
    } else {
        //console.log(`Channel with ID ${guildId} not found`);
    }
}

client.once('ready', () => {
    console.log('Music Bot Ready!');
     console.log('CODED BY DEVRY!');
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

    if (command === 'play'){
        const voiceChannel = message.member.voice.channel;
        if (voiceChannel) {
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

            const embed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Song Added to Queue')
            message.channel.send({ embeds: [embed] });

            if (queue.length === 1) {
                playSong(message.guild.id);
            }
        }
    } else if (command === 'stop') {
        const connection = getVoiceConnection(message.guild.id);
        if (connection) {
            connection.destroy();
        }
        queues.delete(message.guild.id);

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Stopped')
            .setDescription('The music has been stopped and the queue has been cleared.');
        message.channel.send({ embeds: [embed] });
    } else if (command === 'pause') {
        if (player.state.status !== AudioPlayerStatus.Paused) {
            player.pause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Paused')
            .setDescription('The music has been paused.');
        message.channel.send({ embeds: [embed] });
    } else if (command === 'resume') {
        if (player.state.status === AudioPlayerStatus.Paused) {
            player.unpause();
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Music Resumed')
            .setDescription('The music has been resumed.');
        message.channel.send({ embeds: [embed] });
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
            );
        
        message.channel.send({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
