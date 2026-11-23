import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// 不使用 StrictMode：其开发模式下的 effect 双调用会创建并销毁两次 Phaser.Game，
// 导致 WebGL 上下文被提前释放（控制台出现 drawImage null 的 Promise rejection）。
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
