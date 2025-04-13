import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ChatInterface.css';

const formatMessage = (content) => {
  const lines = content.split('\n');
  let formattedContent = '';
  let inList = false;
  let indentLevel = 0;

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      formattedContent += '<br>';
      return;
    }

    // Handle indentation
    const leadingSpaces = line.match(/^\s*/)[0].length;
    const newIndentLevel = Math.floor(leadingSpaces / 2);
    
    if (newIndentLevel !== indentLevel) {
      if (newIndentLevel > indentLevel) {
        formattedContent += '<ul class="nested-list">'.repeat(newIndentLevel - indentLevel);
      } else {
        formattedContent += '</ul>'.repeat(indentLevel - newIndentLevel);
      }
      indentLevel = newIndentLevel;
    }

    // Handle different types of lines
    if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-')) {
      if (!inList) {
        formattedContent += '<ul>';
        inList = true;
      }
      const bulletContent = trimmedLine.substring(1).trim();
      formattedContent += `<li>${bulletContent}</li>`;
    } else if (trimmedLine.endsWith(':')) {
      if (inList) {
        formattedContent += '</ul>';
        inList = false;
      }
      formattedContent += `<h3>${trimmedLine}</h3>`;
    } else {
      if (inList) {
        formattedContent += '</ul>';
        inList = false;
      }
      formattedContent += `<p>${trimmedLine}</p>`;
    }
  });

  // Close any remaining lists
  if (inList) {
    formattedContent += '</ul>';
  }
  if (indentLevel > 0) {
    formattedContent += '</ul>'.repeat(indentLevel);
  }

  return formattedContent;
};

const TypewriterMessage = ({ content }) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    let currentIndex = 0;
    const typingSpeed = 30; // milliseconds per character

    const typeNextCharacter = () => {
      if (currentIndex < content.length) {
        setDisplayedContent(prev => prev + content[currentIndex]);
        currentIndex++;
        setTimeout(typeNextCharacter, typingSpeed);
      } else {
        setIsTyping(false);
      }
    };

    typeNextCharacter();

    return () => {
      currentIndex = content.length; // Cleanup to prevent memory leaks
    };
  }, [content]);

  return (
    <div className={`message bot-message ${isTyping ? 'typing' : ''}`}>
      <div dangerouslySetInnerHTML={{ __html: formatMessage(displayedContent) }} />
    </div>
  );
};

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const chatMessagesRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    if (chatMessagesRef.current && shouldAutoScroll) {
      const chatMessages = chatMessagesRef.current;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }, [shouldAutoScroll]);

  const handleScroll = useCallback(() => {
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 100;
    setShouldAutoScroll(isAtBottom);
  }, []);

  useEffect(() => {
    const chatMessages = chatMessagesRef.current;
    if (chatMessages) {
      chatMessages.addEventListener('scroll', handleScroll);
      return () => chatMessages.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, { type: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      if (!data.response) {
        throw new Error('No response received from server');
      }

      setMessages(prev => [...prev, { type: 'bot', content: data.response }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        type: 'bot', 
        content: error.message || 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages" ref={chatMessagesRef}>
        {messages.map((message, index) => (
          message.type === 'user' ? (
            <div 
              key={index} 
              className="message user-message"
              dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
            />
          ) : (
            <TypewriterMessage key={index} content={message.content} />
          )
        ))}
        {isLoading && (
          <div className="typing-indicator">
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
          </div>
        )}
      </div>
      <div className="input-container">
        <input
          type="text"
          className="chat-input"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about hair care..."
          disabled={isLoading}
        />
        <button 
          type="button" 
          className="send-button"
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatInterface; 