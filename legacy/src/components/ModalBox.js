import './modalBox.css';

function ModalBox(props) {
  const closeModal = () => {
    props.display(false);
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <span id="modal-close" onClick={closeModal}>
          Close
        </span>
        <h3>{props.heading}</h3>
        <br />
        <br />
        <div className="text-center">{props.content}</div>
      </div>
    </div>
  );
}

export default ModalBox;
