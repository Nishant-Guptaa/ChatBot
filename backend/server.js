require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Chat = require('./models/Chat');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Validate environment variables
if (!process.env.GOOGLE_API_KEY) {
  console.error('Error: GOOGLE_API_KEY is not set in environment variables');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI is not set in environment variables');
  process.exit(1);
}

// Connect to MongoDB with retry logic
const connectWithRetry = async () => {
  try {
    const mongoOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
    };

    console.log('Attempting to connect to MongoDB...');
    const connectionString = process.env.MONGODB_URI.replace('mongodb://', 'mongodb+srv://');
    await mongoose.connect(connectionString, mongoOptions);
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    console.log('Retrying connection in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
};

// Start the connection
connectWithRetry();

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully');
});

// Initialize Google Generative AI with error handling
let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  console.log('Google AI initialized successfully');
} catch (error) {
  console.error('Error initializing Google AI:', error);
  process.exit(1);
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      googleAI: genAI ? 'initialized' : 'not initialized'
    }
  });
});

// List available models
app.get('/api/models', async (req, res) => {
  try {
    const models = await genAI.listModels();
    res.json(models);
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: 'Failed to list models' });
  }
});

// Function to check if message is hair care related using AI
async function isHairCareRelated(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `Analyze the following user message and determine if it is related to hair care.
    Consider topics such as hair health, hair loss, hair growth, hair care products, scalp care, and hair treatments.
    Respond with true if the message is related to hair care and false otherwise. Do not provide explanations—only return true or false.
    Examples:
    Input: "How can I make my hair grow faster?"
    Output: true
    
    Input: "What's the weather like today?"
    Output: false
    
    Message to check: "${message}"
    
    Respond with ONLY "true" or "false".`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim().toLowerCase();
    return response === 'true';
  } catch (error) {
    console.error('Error checking if message is hair care related:', error);
    // Fallback to basic keyword check in case of API error
    const basicKeywords = [
      'hair', 'scalp', 'shampoo', 'conditioner', 'dandruff', 'baldness',
      'hair loss', 'hair growth', 'hair care', 'hair treatment', 'hair style',
      'hair type', 'hair health', 'hair products', 'hair routine', 'hair tips',
      'hair advice', 'hair maintenance', 'hair problems', 'hair solutions'
    ];
    return basicKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }
}

// Function to format response with proper styling
function formatResponse(response) {
  // Remove any markdown formatting
  let formattedResponse = response.replace(/\*\*/g, '').replace(/\*/g, '');
  
  // Minimize spacing between sections
  formattedResponse = formattedResponse
    .replace(/\n{3,}/g, '\n')  // Replace multiple newlines with single newline
    .replace(/([.!?])\s*\n/g, '$1\n')  // Single newline after sentences
    .replace(/([.!?])\s*([A-Z])/g, '$1\n$2');  // Single newline before new sentences

  // Format bullet points consistently
  formattedResponse = formattedResponse
    .replace(/^[-•*]\s/gm, '• ')  // Convert various bullet types to bullet points
    .replace(/\n\s*[-•*]\s/g, '\n• ');  // Convert inline bullet points

  // Remove extra spacing around bullet points
  formattedResponse = formattedResponse
    .replace(/\n\s*•/g, '\n•')  // Remove space before bullet points
    .replace(/\n\s*\n\s*\n/g, '\n');  // Remove excessive spacing

  // Clean up any remaining formatting issues
  formattedResponse = formattedResponse
    .replace(/\s{3,}/g, ' ')  // Replace multiple spaces with single space
    .trim();  // Remove leading/trailing whitespace

  return formattedResponse;
}

// Function to generate hair care response
async function generateHairCareResponse(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `You are a friendly hair care expert. Generate a very brief and simple response to the user's question.
    Follow these rules:
    1. Keep responses under 3-4 sentences
    2. Use simple, everyday language
    3. Focus on 1-2 key points only
    4. Use bullet points for tips
    5. Add one relevant emoji at the end
    6. Avoid technical terms
    7. Be direct and to the point
    
    Example format:
    • Key tip 1
    • Key tip 2
    Follow-up question? 😊
    
    User's question: ${message}
    
    Provide a very brief, simple response following the example format.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    return formatResponse(response);
  } catch (error) {
    console.error('Error generating hair care response:', error);
    if (error.message.includes('models/')) {
      throw new Error('AI model configuration error. Please check the model name.');
    }
    throw error;
  }
}

// Function to handle out-of-domain messages
async function handleOutOfDomain(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `You are a friendly hair care expert chatbot. The user has asked something not about hair care.
    Generate a very brief, simple response that:
    1. Politely explains you only help with hair care
    2. Suggests a hair-related topic they could ask about
    3. Keep it under 2 sentences
    4. Add a friendly emoji
    
    Example:
    "I specialize in hair care advice! Try asking about hair health or styling tips instead. 💇‍♀️"
    
    User's question: ${message}
    
    Generate a very brief, friendly response following the example format.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return formatResponse(response.text());
  } catch (error) {
    console.error('Error generating out-of-domain response:', error);
    if (error.message.includes('models/')) {
      throw new Error('AI model configuration error. Please check the model name.');
    }
    throw new Error('Failed to generate response. Please try again later.');
  }
}

// Function to generate welcome message
async function generateWelcomeMessage() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `You are a friendly hair care expert chatbot. Generate a very brief welcome message that:
    1. Introduces yourself in one sentence
    2. Lists 2-3 simple things you can help with
    3. Keep it under 3 sentences total
    4. Use bullet points
    5. Add friendly emojis
    
    Example:
    "Hi! I'm your hair care assistant. I can help with:
    • Hair care tips
    • Styling advice
    • Product recommendations
    What would you like to know? 💇‍♀️"
    
    Generate a very brief, friendly welcome message following the example format.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    return formatResponse(response);
  } catch (error) {
    console.error('Error generating welcome message:', error);
    throw new Error('Failed to generate welcome message');
  }
}

// Chat route
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let response;
    
    try {
      // Check if it's a welcome message request (only for greetings)
      const isGreeting = message.toLowerCase().match(/^(hi|hello|hey|greetings|good (morning|afternoon|evening))/);
      
      if (isGreeting) {
        response = await generateWelcomeMessage();
      } else if (await isHairCareRelated(message)) {
        response = await generateHairCareResponse(message);
      } else {
        response = await handleOutOfDomain(message);
      }

      if (!response) {
        throw new Error('Failed to generate response');
      }

      // Save user message
      const userChat = new Chat({
        type: 'user',
        content: message.trim(),
        timestamp: new Date()
      });

      // Save bot response
      const botChat = new Chat({
        type: 'bot',
        content: response.trim(),
        timestamp: new Date()
      });

      try {
        await Promise.all([userChat.save(), botChat.save()]);
        console.log('Chat saved successfully');
      } catch (dbError) {
        console.error('Error saving chat to database:', dbError);
        // Continue with the response even if saving fails
      }

      res.json({ response });
    } catch (error) {
      console.error('Error processing chat:', error);
      res.status(500).json({ 
        error: error.message || 'An error occurred while processing your request' 
      });
    }
  } catch (error) {
    console.error('Error in chat route:', error);
    res.status(500).json({ 
      error: 'An unexpected error occurred. Please try again.' 
    });
  }
});

// Get chat history route
app.get('/api/chat/history', async (req, res) => {
  try {
    const history = await Chat.find()
      .sort({ timestamp: -1 }) // Sort by newest first
      .limit(50); // Limit to last 50 messages
    res.json(history);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 