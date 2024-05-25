# Discord Music Bot

A Discord bot that plays music from YouTube videos. It supports basic music commands like play, stop, pause, resume, and skip.

## Features

- **Play Music:** Add songs to the queue and play them in a voice channel.
- **Pause/Resume Music:** Pause and resume the currently playing song.
- **Skip Music:** Skip the current song and play the next song in the queue.
- **Stop Music:** Stop the music and clear the queue.
- **Help Command:** Display a list of available commands.

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (version 16.6.0 or higher)
- [Discord Account](https://discord.com/)
- [Discord Bot Token](https://discord.com/developers/applications)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/discord-music-bot.git
cd discord-music-bot
```

2. Install the required dependencies:

```bash
npm install discord.js ytdl-core @discordjs/voice dotenv
```

3. Create a `.env` file in the root directory and add your Discord bot token and command prefix:

```env
DISCORD_TOKEN=your-bot-token
PREFIX=!
```

### Running the Bot

1. Start the bot:

```bash
node index.js
```

2. Invite the bot to your server using the OAuth2 URL generated from the Discord Developer Portal.

## Commands

- `!play [YouTube URL]` - Add a song from YouTube to the queue and play it in the voice channel.
- `!stop` - Stop the currently playing song and clear the queue.
- `!pause` - Pause the currently playing song.
- `!resume` - Resume the currently playing song.
- `!skip` - Skip to the next song in the queue.
- `!help` - Display a list of available commands.

## Example Usage

1. Join a voice channel.
2. Type `!play [YouTube URL]` in a text channel to add a song to the queue and start playing music.
3. Use `!pause` and `!resume` to control playback.
4. Use `!skip` to skip to the next song in the queue.
5. Use `!stop` to stop the music and clear the queue.
6. Type `!help` to see the list of available commands.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
