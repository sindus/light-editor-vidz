import { useState } from "react";
import "./App.css";
import Home from "./components/Home";
import Editor from "./components/Editor";

function App() {
  const [projectDir, setProjectDir] = useState<string | null>(null);

  if (projectDir) {
    return <Editor projectDir={projectDir} onBack={() => setProjectDir(null)} onOpenProject={setProjectDir} />;
  }

  return <Home onOpenProject={setProjectDir} />;
}

export default App;
