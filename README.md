# Discord Music Bot

A Discord bot that plays music from YouTube videos in a voice channel. The bot supports basic music control commands like play, stop, pause, resume, and skip. It also manages an embed queue to display the current song and the next song in the queue.

## Features

- Play music from YouTube links.
- Pause, resume, and skip music.
- Display the current song and the next song using embeds.
- Clear all embeds when the stop command is initiated to keep the chat clean.

## Prerequisites

- [Node.js](https://nodejs.org/) (version 16 or higher)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- A Discord bot token. You can get one by creating a bot on the [Discord Developer Portal](https://discord.com/developers/applications).

## Installation

1. Clone the repository or download the source code.

2. Navigate to the project directory.

    ```sh
    cd your-project-directory
    ```

3. Install the required dependencies.

    ```sh
    npm install discord.js ytdl-core @discordjs/voice dotenv
    ```

4. Create a `.env` file in the root directory and add your Discord bot token and the command prefix.

    ```
    DISCORD_TOKEN=your-bot-token
    PREFIX=!
    ```

## Usage

1. Run the bot.

    ```sh
    node index.js
    ```

2. Invite the bot to your Discord server. You can use the OAuth2 URL generator on the Discord Developer Portal to get an invite link.

3. Use the following commands in your Discord server:

    - `!play [YouTube URL]` - Add a song from YouTube to the queue and start playing if not already playing.
    - `!stop` - Stop the currently playing song and clear the queue.
    - `!pause` - Pause the currently playing song.
    - `!resume` - Resume the currently paused song.
    - `!skip` - Skip to the next song in the queue.
    - `!help` - Display the list of available commands.

## Bot Commands

- **!play [YouTube URL]**
  - Adds a song from YouTube to the queue and starts playing if not already playing.
  
- **!stop**
  - Stops the currently playing song and clears the queue. Deletes all embed messages to keep the chat clean.
  
- **!pause**
  - Pauses the currently playing song.
  
- **!resume**
  - Resumes the currently paused song.
  
- **!skip**
  - Skips to the next song in the queue.
  
- **!help**
  - Displays a list of available commands.

## Code Explanation

### `index.js`

This is the main file that initializes the bot and handles all the commands.

- **Dependencies and Initialization:**
    - Requires necessary modules: `discord.js`, `ytdl-core`, `fs`, `@discordjs/voice`, and `dotenv`.
    - Creates a new `Discord.Client` with appropriate intents.
    - Creates an audio player using `createAudioPlayer` from `@discordjs/voice`.
    
- **Event Handlers:**
    - `player.on('error')`: Handles any errors that occur during audio playback.
    - `client.once('ready')`: Loads the queue from a JSON file and logs in the bot.
    - `client.on('messageCreate')`: Handles incoming messages and executes the appropriate commands.

- **Command Functions:**
    - `playSong(guildId, textChannel, retry)`: Plays the next song in the queue and updates the embeds.
    - `deleteLastEmbeds(guildId)`: Deletes the last "Now Playing", "Song Added to Queue", and "Up Next" embeds to keep the chat clean.
    
- **Commands:**
    - `!play [YouTube URL]`: Adds a song to the queue and starts playback.
    - `!stop`: Stops the music and clears the queue.
    - `!pause`: Pauses the currently playing song.
    - `!resume`: Resumes the currently paused song.
    - `!skip`: Skips to the next song in the queue.
    - `!help`: Displays the help message with available commands.

## License

This project is licensed under the MIT License.
