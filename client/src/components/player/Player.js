import React, { Component } from 'react';
import './Player.scss';
// import '../resizer/Resizer.scss'
import Timeline from '../timeline/Timeline';
import Canvas from '../canvas/Canvas';
// import Resizer from '../resizer/Resizer';
import { Row, Col, Slider, Button } from 'antd';
import { Rnd } from 'react-rnd';


const cv = window.cv;
const KalmanFilter = window.KalmanFilter;

class Player extends Component {
    constructor(props) {
        super(props);

        this.state = {
            hiddenFrame: {

            },
            previewFrame: {
                sx: 0,
                sy: 0,
                sWidth: 270,
                sHeight: 480
            },
            resizerOpts: {
                className: 'resizer',
                minWidth: 100,
                minHeight: 100,
                bounds: 'parent',
                resizeHandleClasses: {
                    bottom: 'bottom',
                    bottomLeft: 'bottom-left',
                    bottomRight: 'bottom-right',
                    left: 'left',
                    right: 'right',
                    top: 'top',
                    topLeft: 'top-left',
                    topRight: 'top-right'
                },
                onDrag: (e, d) => {
                    this.setState({
                        previewFrame: {
                            sx: d.x,
                            sy: d.y,
                            sWidth: e.target.offsetWidth,
                            sHeight: e.target.offsetHeight
                        }
                    });
                },
                onResize: (e, direction, ref, delta, position) => {
                    this.setState({
                        previewFrame: {
                            sx: position.x,
                            sy: position.y,
                            sWidth: ref.offsetWidth,
                            sHeight: ref.offsetHeight
                        }
                    });
                }
            },
            frameBuffer: []
        };

        // frame constructor
        this.frame = {
            num: 0, // frame number,
            src: '', // src of frame( from video)
            sx: 0, // x value of src image
            sy: 0, // y value of src image
            dx: 0, // x value of destination canvas
            dy: 0, // y value of destination canvas
            oh: 0, // original height of video
            ow: 0, // original width of video
            h: 0, //  height of frame
            w: 0, //  width of frame
            t: 0, // time of frame in the video
            ar: 9/16 // aspect ratio of frame( this could change in future for 1:1)
        }

        this.reqAnimeId = '';

        // create refs to store the video and canvas DOM element
        this.videoEl = React.createRef();
        this.canvasEl = React.createRef();
        this.previewCanvasEl = React.createRef();
    }

    initVideoProcessing() {
        let video = this.videoEl.current;
        let cap = new cv.VideoCapture(video);

        // parameters for ShiTomasi corner detection
        let [maxCorners, qualityLevel, minDistance, blockSize] = [1000, 0.001, 3, 3];

        // take first frame and find corners in it
        let srcFrame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        let grayFrame = new cv.Mat(video.height, video.width, cv.CV_8UC4);

        let corners = new cv.Mat();
        let goodFeatures = [];

        let begin, sum, point, avgX;
        const FPS = 24;
        const kf = new KalmanFilter({ R: 0.01, Q: 4 });

        const processVideo = () => {
            try {
                if (video.paused || video.ended) {
                    // clean and stop.
                    // src.delete(); dst.delete();
                    // record.stop();
                    // record.onstop = e => this.exportVideo(new Blob(chunks, { type: 'video/mp4' }));
                    return;
                }

                begin = Date.now();
                cap.read(srcFrame);
                cv.cvtColor(srcFrame, grayFrame, cv.COLOR_RGBA2GRAY);
                cv.goodFeaturesToTrack(grayFrame, corners, maxCorners, qualityLevel, minDistance, new cv.Mat(), blockSize);

                sum = 0;
                goodFeatures = [];
                for (var i = 0; i < corners.rows; i++) {
                    point = new cv.Point(corners.data32F[i * 2], corners.data32F[(i * 2) + 1]);
                    goodFeatures.push(point);
                    sum = sum + (point.x - 135);
                }

                avgX = sum / corners.rows;

                this.setState({
                    previewFrame: {
                        sx: avgX ? kf.filter(avgX) : 0,
                        sy: 0,
                        sWidth: this.videoEl.current.height * (9 / 16),
                        sHeight: this.videoEl.current.height
                    }
                });

                // for (let i = 0; i < goodFeatures.length; i++) {
                //     cv.circle(srcFrame, goodFeatures[i], 3, new cv.Scalar(10, 200, 10), -1);
                // }

                // cv.imshow('canvasOutput', srcFrame);
                // this.detectSceneChange(srcFrame, prevFrame);

                // console.log('x', avgX);
                // console.log('kalman x:', kf.filter(avgX));
                // console.log('t:', begin);

                // schedule the next one.
                let delay = 1000 / FPS - (Date.now() - begin);
                window.setTimeout(processVideo, delay);
            } catch (err) {
                console.error(err);
            }
        };

        // schedule the first one.
        window.setTimeout(processVideo, 0);
    }

    componentDidMount() {
        const ctx = this.canvasEl.current.getContext('2d');
        const previewCtx = this.previewCanvasEl.current.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        let imageData;

        // draw frames on hidden canvas for collecting salient feature points
        const drawFrames = (video) => {
            if (!video.paused && !video.ended) {
                ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
                updateFrameBuffer(video);
                drawPreviewFrames();
                window.requestAnimationFrame(() => drawFrames(video));
            }
        }

        // preview canvas of actual cropped video
        const drawPreviewFrames = () => {
            imageData = ctx.getImageData(this.state.previewFrame.sx,
                this.state.previewFrame.sy, this.state.previewFrame.sWidth,
                this.state.previewFrame.sHeight);

            previewCtx.putImageData(imageData, 0, 0);
        }

        // update frame buffer
        const updateFrameBuffer = (video) => {
            let newFrame = Object.create(this.frame);

            newFrame.num = this.state.frameBuffer.length;
            newFrame.src = video;
            newFrame.x = 0;
            newFrame.y = 0;
            newFrame.sx = this.state.previewFrame.sx;
            newFrame.sy = this.state.previewFrame.sy;
            newFrame.oh = video.height;
            newFrame.ow = video.width;
            newFrame.h = 95;
            newFrame.w = 120;
            newFrame.t = video.currentTime;
            newFrame.ar = 9 / 16;

            this.setState(prevState => ({
                frameBuffer: [...prevState.frameBuffer, newFrame]
            }));
        }

        // event triggered on playing video
        this.videoEl.current.addEventListener('play', (e) => {
            drawFrames(this.videoEl.current);
            this.initVideoProcessing();
        });

        // event triggered while playing video
        this.videoEl.current.addEventListener('timeupdate', (e) => {
            
        });

        // event is fired when video is ready to play.
        this.videoEl.current.addEventListener('canplay', (e) => {
            // reset video frames on choosing another video
            this.setState({
                frameBuffer: []
            });
        });
    }

    componentWillUnmount() {
        if (this.reqAnimeId)
            cancelAnimationFrame(this.reqAnimeId);
    }

    render() {
        return (
            <div className="player">
                <Row>
                    <Col span={15}>
                        <div className="video-container">
                            <video width="640" height="480" controls src={this.props.videoSrc} ref={this.videoEl} >
                                Sorry, your browser doesn't support embedded videos.
                            </video>
                            <Timeline frames={this.state.frameBuffer}></Timeline>
                        </div>
                        <div className="canvas-container">
                            <canvas ref={this.canvasEl} width="640" height="480" style={{ display: 'none' }}></canvas>
                            {/* <Rnd ref={c => { this.rnd = c; }} {...this.state.resizerOpts}></Rnd>
                            <div>{this.state.video.currentAt} / {this.state.video.duration}</div>
                            <Slider step={0.01} className="canvas-timeline"
                                max={parseFloat(this.state.video.duration)}
                                value={parseFloat(this.state.video.currentAt)}
                                onChange={this.seek.bind(this)} />
                            <Button type="primary" onClick={this.play}>Play</Button>
                            <Button type="primary" onClick={this.pause}>Pause</Button> */}
                        </div>
                    </Col>
                    <Col span={9}>
                        <div className="preview-container">
                            <canvas ref={this.previewCanvasEl} width={this.state.previewFrame.sWidth} height={this.state.previewFrame.sHeight}></canvas>
                        </div>
                        {/* <canvas id="canvasOutput"></canvas> */}
                    </Col>
                </Row>
            </div>
        )
    }
}

export default Player;