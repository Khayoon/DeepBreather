import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import ModalBox from './components/ModalBox'

function App() {
  const [count, setCount] = useState(0)

  // State variable for managing modal visibility. Set to false by default.
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div>
        {/* Modal box will be rendered here. */}
        {showModal && (
          <ModalBox
            display={setShowModal}
            heading="Configuration."
            content="Click out and start if not needed."
          />
        )}
        
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Deep Breather</h1>
      <div className="card">
        <button onClick={() => setCount(count + 1)}>
          Start {count}
        </button>
      </div>
      
      <button onClick={() => setShowModal(true)}>
        Click me for Modal box
      </button>
    </>
  )
}

export default App
