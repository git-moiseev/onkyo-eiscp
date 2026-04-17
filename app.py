from flask import Flask, render_template, request, jsonify
import eiscp
import threading
from contextlib import closing
from collections.abc import Iterable

#  https://github.com/miracle2k/onkyo-eiscp

app = Flask(__name__)

DEVICE_IP = "192.168.1.40"

STATUS_COMMANDS = [
    "system-power query",
    "master-volume query",
    "audio-muting query",
]


def normalize_response(response):
    """Convert an eISCP response into a dictionary."""
    if isinstance(response, dict):
        return response

    if isinstance(response, tuple) and len(response) == 2:
        key, value = response
        return {key: value}

    return {"raw": response}


def normalize_power_value(value):
    """Normalize receiver power state for the frontend."""
    if isinstance(value, (tuple, list)):
        lowered = {str(v).lower() for v in value}
        return "on" if "on" in lowered else "off"

    return value

def run_receiver_command(commands=None, *, include_info=False):
    receiver = None
    try:
        receiver = eiscp.eISCP(DEVICE_IP)
        result = {}

        if include_info:
            result.update(receiver.info or {})
            result["IP Address"] = DEVICE_IP

        if commands is None:
            return result

        if isinstance(commands, str):
            result.update(normalize_response(receiver.command(commands)))
            return result

        if isinstance(commands, (list, tuple)):
            for command in commands:
                if not isinstance(command, str):
                    raise TypeError(f"Command must be str, got {type(command).__name__}")
                result.update(normalize_response(receiver.command(command)))
            return result

        raise TypeError("commands must be None, a string, or a list/tuple of strings")

    except Exception as e:
        print(f"Error running receiver command(s) {commands!r}: {e}")
        return {}

    finally:
        if receiver:
            try:
                receiver.disconnect()
            except Exception:
                pass


def send_eiscp_command_async(command):
    """Send one eISCP command in a background thread."""
    def _send():
        result = run_receiver_command(command)
        if result:
            print(f"Command {command!r} response: {result}")

    threading.Thread(target=_send, daemon=True).start()


def get_receiver_info():
    """Get receiver info plus current live status."""
    return run_receiver_command(STATUS_COMMANDS, include_info=True)


def get_receiver_status():
    """Get only the live values needed by the frontend."""
    data = run_receiver_command(STATUS_COMMANDS)

    return {
        "master-volume": data.get("master-volume", 0),
        "system-power": normalize_power_value(data.get("system-power", "off")),
        "audio-muting": data.get("audio-muting", "off"),
    }


@app.route("/")
def index():
    device_info = get_receiver_info()
    print(f"Device info: {device_info}")
    return render_template("index.html", device_info=device_info)


@app.route("/command", methods=["POST"])
def handle_command():
    data = request.get_json(silent=True) or {}
    command = data.get("command")

    if not command:
        return jsonify({"status": "error", "message": "Missing command"}), 400

    send_eiscp_command_async(command)
    return jsonify({"status": "success", "command": command})


@app.route("/status")
def status():
    return jsonify({
        "status": "success",
        "data": get_receiver_status(),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)


