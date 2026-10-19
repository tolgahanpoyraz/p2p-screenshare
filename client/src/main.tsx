import '@material-symbols/font-400/rounded.css';
import { render } from 'preact';
import './ui/tokens.css';
import './ui/styles.css';
import { App } from './ui/app.tsx';

render(<App />, document.getElementById('app')!);
