const express = require('express');
const axios = require('axios');
const redis = require('redis');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const redisClient = redis.createClient({
  url: 'redis://localhost:6379' // Define the Redis URL
});
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Middleware to parse JSON
app.use(bodyParser.json());

// Connect to Redis
async function connectRedis() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Error connecting to Redis:', error);
  }
}

// Load users from JSON file
const users = JSON.parse(fs.readFileSync('users.json')).users;

// Helper function for checking user credentials
function validateUser(username, password) {
  return users.some(user => user.username === username && user.password === password);
}

// Login endpoint with login count tracking
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (validateUser(username, password)) {
    try {
      // Track login count
      const loginCount = await redisClient.incr(`${username}:login_count`);

      // Store session for 1 hour
      await redisClient.set(username, 'logged_in', { EX: 3600 });

      res.status(200).json({
        message: 'Logged in successfully',
        loginCount
      });
    } catch (err) {
      res.status(500).json({ message: 'Error tracking login count or storing session' });
    }
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Photos endpoint with 30-second caching
app.get('/photos', async (req, res) => {
  const { username } = req.query;

  try {
    // Check if user is logged in
    const session = await redisClient.get(username);
    if (session) {
      // Check if photos are cached
      const cachedPhotos = await redisClient.get('photos');
      if (cachedPhotos) {
        console.log('Returning cached photos');
        return res.json(JSON.parse(cachedPhotos));
      }

      // Fetch from external API and cache the result for 30 seconds
      const response = await axios.get('https://jsonplaceholder.typicode.com/photos');
      await redisClient.set('photos', JSON.stringify(response.data), { EX: 30 }); // Cache for 30 seconds
      res.json(response.data);
    } else {
      res.status(401).json({ message: 'Unauthorized: Please log in first' });
    }
  } catch (error) {
    console.error('Error fetching photos', error);
    res.status(500).json({ message: 'Error fetching photos' });
  }
});

// Start the server after connecting to Redis
connectRedis().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
