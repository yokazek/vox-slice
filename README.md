# VoxSlice

[Japanese (日本語)](README_jp.md)

**Live demo: [https://yokazek.github.io/vox-slice/](https://yokazek.github.io/vox-slice/)**


**Precision audio slicing, right in your browser.**

VoxSlice is a fast, web-based tool designed to effortlessly split WAV and MP3 files. With its intuitive waveform editor and automatic silence detection, you can slice audio with precision and export segments instantly—no installation required.

## Key Features

- **Interactive Waveform:** Drag-and-drop interface with smooth zooming and precise seek controls.
- **Smart Auto-Silence Detection:** Automatically identify split points based on silence duration and volume levels.
- **Non-Destructive Editing:** Preview segments and toggle their active status before exporting.
- **Batch Export:** Seamlessly download all segments at once or individually in WAV and MP3 formats.
- **Project Save/Load:** Save your progress as a JSON file and resume editing anytime.
- **Privacy First:** All audio is processed locally in your browser. Your data never leaves your computer.

## How to Use

1. **Upload:** Drag and drop a WAV or MP3 file into the app.
2. **Slice:** Double-click the waveform or press **Enter** to add slice points. You can also use the **Auto-Silence Detection** tool.
3. **Refine:** Toggle segments on/off by right-clicking or using the list below the waveform.
4. **Export:** Choose your format (WAV/MP3) and download all segments as a ZIP file or individual clips.

## Shortcuts

- **Space:** Play / Pause
- **Enter:** Add slice point at playhead
- **Ctrl + Z / Y:** Undo / Redo
- **Arrow Keys / Tab:** Move to previous/next slice point
- **Double Click:** Add slice point on waveform
- **Right Click:** Toggle segment active/inactive
- **Mouse Wheel:** Zoom in/out on waveform

## Tech Stack

- Vanilla JavaScript (ES Modules)
- Web Audio API
- [WaveSurfer.js](https://wavesurfer-js.org/) for waveform rendering
- [lamejs](https://github.com/zhuk/lamejs) for MP3 encoding
- [JSZip](https://stuk.github.io/jszip/) for batch downloads

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
