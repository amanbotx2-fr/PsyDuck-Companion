import psyDuckImage from '../../../character/master.png';

export function PsyDuck() {
  return (
    <img
      className="psyduck"
      src={psyDuckImage}
      alt="PsyDuck"
      draggable={false}
    />
  );
}
