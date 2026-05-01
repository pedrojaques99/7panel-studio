import sounddevice as sd
import soundfile as sf
import sys
import os
import threading

# Adiciona o caminho das bibliotecas do usuário se necessário
user_site = os.path.expanduser("~\\AppData\\Roaming\\Python\\Python313\\site-packages")
if user_site not in sys.path:
    sys.path.append(user_site)

def play_on_device(data, fs, device_id):
    try:
        sd.play(data, fs, device=device_id)
        sd.wait()
    except Exception as e:
        print(f"Erro no dispositivo {device_id}: {e}")

def get_devices():
    devices = sd.query_devices()
    fone_id = None
    cable_id = None
    
    for i, dev in enumerate(devices):
        name = dev['name'].lower()
        # Busca por Arcano e Cable nos drivers DirectSound ou MME
        if "arcano shp-300" in name and dev['max_output_channels'] > 0:
            if fone_id is None or "directsound" in name: fone_id = i
        if "cable input" in name and dev['max_output_channels'] > 0:
            if cable_id is None or "directsound" in name: cable_id = i
            
    return fone_id, cable_id

def play_dual(file_path):
    try:
        data, fs = sf.read(file_path, dtype='float32')
        fone_id, cable_id = get_devices()
        
        if fone_id is None or cable_id is None:
            print(f"Dispositivos não encontrados! Fone: {fone_id}, Cabo: {cable_id}")
            return

        # Cria duas threads para tocar ao mesmo tempo em dispositivos diferentes
        t1 = threading.Thread(target=play_on_device, args=(data, fs, fone_id))
        t2 = threading.Thread(target=play_on_device, args=(data, fs, cable_id))
        
        t1.start()
        t2.start()
        
        t1.join()
        t2.join()
            
    except Exception as e:
        print(f"Erro fatal no mixer: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        play_dual(sys.argv[1])