import React from 'react';
import ChatInterface from './components/ChatInterface';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Hair Care Assistant</h1>
        <p>Your personal AI guide for hair care and styling</p>
        <p>Developed By:Nishant(12315733)</p>
      </header>
      <main className="App-main">
        <ChatInterface />
      </main>
    </div>
  );
}

export default App;
