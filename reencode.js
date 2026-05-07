/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_00td_action_transcode',
    Stage: 'Pre-processing',
    Name: 'Transcode A Video File',
    Type: 'Video',
    Operation: 'Transcode',
    Description: 'Transcode a video file using ffmpeg. GPU transcoding will be used if possible.',
    Version: '3.5',
    Tags: 'pre-processing,ffmpeg,video only,nvenc h265,configurable',
    Inputs: [
      {
        name: 'target_codec',
        type: 'string',
        defaultValue: 'hevc',
        inputUI: {
          type: 'dropdown',
          options: [
            'hevc',
            // 'vp9',
            'h264',
            // 'vp8',
          ],
        },
        tooltip: 'Specify the codec to use',
      },
      {
        name: 'target_bitrate_multiplier',
        type: 'number',
        defaultValue: 0.5,
        inputUI: {
          type: 'text',
        },
        tooltip: `
        Specify the multiplier to use to calculate the target bitrate. 
        Default of 0.5 will roughly half the size of the file.
        `,
      },
      {
        name: 'target_resolution',
        type: 'string',
        defaultValue: 'none',
        inputUI: {
          type: 'dropdown',
          options: [
            'none',
            '720p',
            '480p',
          ],
        },
        tooltip: `
        Optionally rescale the video to the selected resolution target.
        This is independent of target_bitrate_multiplier and does not adjust bitrate calculations.
        `,
      },
      {
        name: 'try_use_gpu',
        type: 'boolean',
        defaultValue: true,
        inputUI: {
          type: 'dropdown',
          options: [
            'false',
            'true',
          ],
        },
        tooltip: 'If enabled then will use GPU if possible.',
      },
      {
        name: 'container',
        type: 'string',
        defaultValue: 'mkv',
        inputUI: {
          type: 'dropdown',
          options: [
            'mkv',
            'mp4',
            'avi',
            'ts',
            'original',
          ],
        },
        tooltip: `Specify output container of file. Use 'original' wihout quotes to keep original container.
                    \\n Ensure that all stream types you may have are supported by your chosen container.
                    \\n mkv is recommended`,
      },
      {
        name: 'bitrate_cutoff',
        type: 'number',
        defaultValue: 0,
        inputUI: {
          type: 'text',
        },
        tooltip: `Specify bitrate cutoff, files with a current bitrate lower then this will not be transcoded.
                   \\n Rate is in kbps.
                   \\n Leave empty to disable.
                        \\nExample:\\n
                        6000
    
                        \\nExample:\\n
                        4000`,
      },
      {
        name: 'enable_10bit',
        type: 'boolean',
        defaultValue: false,
        inputUI: {
          type: 'dropdown',
          options: [
            'false',
            'true',
          ],
        },
        tooltip: `Specify if output file should be 10bit. Default is false.
                        \\nExample:\\n
                        true
    
                        \\nExample:\\n
                        false`,
      },
      {
        name: 'bframes_enabled',
        type: 'boolean',
        defaultValue: false,
        inputUI: {
          type: 'dropdown',
          options: [
            'false',
            'true',
          ],
        },
        tooltip: `Specify if b frames should be used.
                     \\n Using B frames should decrease file sizes but are only supported on newer GPUs.
                     \\n Default is false.
                        \\nExample:\\n
                        true
    
                        \\nExample:\\n
                        false`,
      },
      {
        name: 'bframes_value',
        type: 'number',
        defaultValue: 5,
        inputUI: {
          type: 'text',
        },
        tooltip: 'Specify number of bframes to use.',
      },
      {
        name: 'force_conform',
        type: 'boolean',
        defaultValue: false,
        inputUI: {
          type: 'dropdown',
          options: [
            'false',
            'true',
          ],
        },
        tooltip: `Make the file conform to output containers requirements.
                    \\n Drop hdmv_pgs_subtitle/eia_608/subrip/timed_id3 for MP4.
                    \\n Drop data streams/mov_text/eia_608/timed_id3 for MKV.
                    \\n Default is false.
                        \\nExample:\\n
                        true
    
                        \\nExample:\\n
                        false`,
      },
      {
        name: 'exclude_gpus',
        type: 'string',
        defaultValue: '',
        inputUI: {
          type: 'text',
        },
        tooltip: `Specify the id(s) of any GPUs that needs to be excluded from assigning transcoding tasks.
                   \\n Seperate with a comma (,). Leave empty to disable.
                   \\n Get GPU numbers in the node by running 'nvidia-smi'
                        \\nExample:\\n
                        0,1,3,8
    
                        \\nExample:\\n
                        3
    
                        \\nExample:\\n
                        0`,
      },
    ],
  });
  
  const bframeSupport = [
    'hevc_nvenc',
    'h264_nvenc',
  ];

  const resolutionTargets = {
    '720p': {
      landscape: {
        width: 1280,
        height: 720,
      },
      portrait: {
        width: 720,
        height: 1280,
      },
    },
    '480p': {
      landscape: {
        width: 854,
        height: 480,
      },
      portrait: {
        width: 480,
        height: 854,
      },
    },
  };

  const getResolutionTarget = (targetResolution, width, height) => {
    const target = resolutionTargets[targetResolution];
    if (!target) {
      return null;
    }
    if (width >= height) {
      return target.landscape;
    }
    return target.portrait;
  };

  const streamNeedsResize = (stream, targetResolution) => {
    if (
      targetResolution === 'none'
      || typeof stream.width !== 'number'
      || typeof stream.height !== 'number'
    ) {
      return false;
    }

    const target = getResolutionTarget(targetResolution, stream.width, stream.height);
    if (!target) {
      return false;
    }

    return stream.width > target.width || stream.height > target.height;
  };

  const appendVideoFilter = (extraArguments, videoFilter) => {
    if (!videoFilter) {
      return extraArguments;
    }

    const filterRegex = /-(vf|filter:v)\s+("[^"]*"|'[^']*'|[^\s]+)/;
    const existingFilter = extraArguments.match(filterRegex);
    if (!existingFilter) {
      return `${extraArguments}-vf "${videoFilter}" `;
    }

    const existingExpression = existingFilter[2].replace(/^['"]|['"]$/g, '');
    return extraArguments.replace(
      filterRegex,
      `-${existingFilter[1]} "${existingExpression},${videoFilter}"`,
    );
  };

  const getResolutionFilter = ({ encoder, targetResolution }) => {
    if (targetResolution === 'none') {
      return '';
    }

    const target = resolutionTargets[targetResolution];
    if (!target) {
      return '';
    }

    const scaleFactor = `min(1,if(gte(iw,ih),min(${target.landscape.width}/iw,${target.landscape.height}/ih),min(${target.portrait.width}/iw,${target.portrait.height}/ih)))`;
    const filterName = encoder.includes('nvenc') ? 'scale_cuda' : 'scale';

    return `${filterName}=w='trunc(iw*${scaleFactor}/2)*2':h='trunc(ih*${scaleFactor}/2)*2'`;
  };

  const isUnsupportedStream = (stream) => {
    const codecName = typeof stream.codec_name === 'string' ? stream.codec_name.trim().toLowerCase() : '';
    const codecType = typeof stream.codec_type === 'string' ? stream.codec_type.trim().toLowerCase() : '';

    return codecName === '' || codecName === 'none' || codecName === 'unknown'
      || codecType === '' || codecType === 'unknown';
  };

  const isDisposableVideoStream = (stream) => {
    const codecName = typeof stream.codec_name === 'string' ? stream.codec_name.trim().toLowerCase() : '';
    return codecName === 'mjpeg' || codecName === 'png';
  };

  const getStreamMapArguments = (streamIndexes) => streamIndexes.map((streamIndex) => `-map 0:${streamIndex}`).join(' ');

  const normalizeBitrate = (bitrate) => Math.max(1, Math.round(bitrate));

  const getEncoderRateControl = ({
    encoder,
    currentBitrate,
    targetBitrate,
    maximumBitrate,
  }) => {
    const bitrateSettings = `-b:v ${normalizeBitrate(targetBitrate)} `
      + `-maxrate ${normalizeBitrate(maximumBitrate)} `
      + `-bufsize ${normalizeBitrate(currentBitrate)}`;

    if (encoder === 'hevc_nvenc' || encoder === 'h264_nvenc') {
      return {
        rateControlSettings: `-rc:v vbr -cq:v 19 ${bitrateSettings} `
          + '-spatial_aq:v 1 -rc-lookahead:v 32',
        description: 'NVENC VBR HQ with CQ 19',
      };
    }

    if (encoder === 'hevc_qsv' || encoder === 'h264_qsv') {
      return {
        rateControlSettings: `${bitrateSettings} -extbrc 1 -look_ahead_depth 32`,
        description: 'QSV bitrate mode with extbrc lookahead',
      };
    }

    if (encoder === 'libx265' || encoder === 'libx264') {
      return {
        rateControlSettings: bitrateSettings,
        description: 'software encoder bitrate mode',
      };
    }

    return {
      rateControlSettings: bitrateSettings,
      description: 'generic bitrate mode',
    };
  };
  
  const hasEncoder = async ({
    ffmpegPath,
    encoder,
    inputArgs,
    filter,
  }) => {
    const { exec } = require('child_process');
    let isEnabled = false;
    try {
      isEnabled = await new Promise((resolve) => {
        const command = `${ffmpegPath} ${inputArgs || ''} -f lavfi -i color=c=black:s=512x512:d=1:r=30`
                + ` ${filter || ''}`
                + ` -c:v ${encoder} -f null /dev/null`;
        exec(command, (
          error,
          // stdout,
          // stderr,
        ) => {
          if (error) {
            resolve(false);
            return;
          }
          resolve(true);
        });
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(err);
    }
  
    return isEnabled;
  };
  
  // credit to UNCode101 for this
  const getBestNvencDevice = ({
    response,
    inputs,
    nvencDevice,
  }) => {
    const { execSync } = require('child_process');
    let gpu_num = -1;
    let lowest_gpu_util = 100000;
    let result_util = 0;
    let gpu_count = -1;
    let gpu_names = '';
    const gpus_to_exclude = inputs.exclude_gpus === '' ? [] : inputs.exclude_gpus.split(',').map(Number);
    try {
      gpu_names = execSync('nvidia-smi --query-gpu=name --format=csv,noheader');
      gpu_names = gpu_names.toString().trim();
      gpu_names = gpu_names.split(/\r?\n/);
      /* When nvidia-smi returns an error it contains 'nvidia-smi' in the error
        Example: Linux: nvidia-smi: command not found
                 Windows: 'nvidia-smi' is not recognized as an internal or external command,
                     operable program or batch file. */
      if (!gpu_names[0].includes('nvidia-smi')) {
        gpu_count = gpu_names.length;
      }
    } catch (error) {
      response.infoLog += 'Error in reading nvidia-smi output! \n';
      // response.infoLog += error.message;
    }
  
    if (gpu_count > 0) {
      for (let gpui = 0; gpui < gpu_count; gpui++) {
        // Check if GPU # is in GPUs to exclude
        if (gpus_to_exclude.includes(gpui)) {
          response.infoLog += `GPU ${gpui}: ${gpu_names[gpui]} is in exclusion list, will not be used!\n`;
        } else {
          try {
            const cmd_gpu = `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits -i ${gpui}`;
            result_util = parseInt(execSync(cmd_gpu), 10);
            if (!Number.isNaN(result_util)) { // != "No devices were found") {
              response.infoLog += `GPU ${gpui} : Utilization ${result_util}%\n`;
  
              if (result_util < lowest_gpu_util) {
                gpu_num = gpui;
                lowest_gpu_util = result_util;
              }
            }
          } catch (error) {
            response.infoLog += `Error in reading GPU ${gpui} Utilization\nError: ${error}\n`;
          }
        }
      }
    }
    if (gpu_num >= 0) {
      // eslint-disable-next-line no-param-reassign
      nvencDevice.inputArgs = `-hwaccel_device ${gpu_num}`;
      // eslint-disable-next-line no-param-reassign
      nvencDevice.outputArgs = `-gpu ${gpu_num}`;
    }
  
    return nvencDevice;
  };
  
  const getEncoder = async ({
    response,
    inputs,
    otherArguments,
  }) => {
    if (
      otherArguments.workerType
      && otherArguments.workerType.includes('gpu')
      && inputs.try_use_gpu && (inputs.target_codec === 'hevc' || inputs.target_codec === 'h264')) {
      const gpuEncoders = [
        {
          encoder: 'hevc_nvenc',
          enabled: false,
        },
        {
          encoder: 'hevc_amf',
          enabled: false,
        },
        {
          encoder: 'hevc_vaapi',
          inputArgs: '-hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format vaapi',
          enabled: false,
          filter: '-vf format=nv12,hwupload',
        },
        {
          encoder: 'hevc_rkmpp',
          enabled: false,
        },
        {
          encoder: 'hevc_qsv',
          enabled: false,
        },
        {
          encoder: 'hevc_videotoolbox',
          enabled: false,
        },
  
        {
          encoder: 'h264_nvenc',
          enabled: false,
        },
        {
          encoder: 'h264_rkmpp',
          enabled: false,
        },
        {
          encoder: 'h264_amf',
          enabled: false,
        },
        {
          encoder: 'h264_qsv',
          enabled: false,
        },
        {
          encoder: 'h264_videotoolbox',
          enabled: false,
        },
      ];
  
      const filteredGpuEncoders = gpuEncoders.filter((device) => device.encoder.includes(inputs.target_codec));
  
      // eslint-disable-next-line no-restricted-syntax
      for (const gpuEncoder of filteredGpuEncoders) {
        // eslint-disable-next-line no-await-in-loop
        gpuEncoder.enabled = await hasEncoder({
          ffmpegPath: otherArguments.ffmpegPath,
          encoder: gpuEncoder.encoder,
          inputArgs: gpuEncoder.inputArgs,
          filter: gpuEncoder.filter,
        });
      }
  
      const enabledDevices = gpuEncoders.filter((device) => device.enabled === true);
  
      if (enabledDevices.length > 0) {
        let selectedDevice = enabledDevices[0];
        if (selectedDevice.encoder.includes('vaapi')) {
          const qsvDevice = enabledDevices.find((device) => device.encoder.includes('qsv'));
          if (qsvDevice) {
            selectedDevice = qsvDevice;
          }
        }
        if (selectedDevice.encoder.includes('nvenc')) {
          return getBestNvencDevice({
            response,
            inputs,
            nvencDevice: selectedDevice,
          });
        }
        return selectedDevice;
      }
    }
  
    if (inputs.target_codec === 'hevc') {
      return {
        encoder: 'libx265',
        inputArgs: '',
      };
    } if (inputs.target_codec === 'h264') {
      return {
        encoder: 'libx264',
        inputArgs: '',
      };
    }
  
    return {
      encoder: '',
      inputArgs: '',
    };
  };
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const plugin = async (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);
    const response = {
      processFile: false,
      preset: '',
      handBrakeMode: false,
      FFmpegMode: true,
      reQueueAfter: true,
      infoLog: '',
    };
  
    const encoderProperties = await getEncoder({
      response,
      inputs,
      otherArguments,
    });
  
    const targetContainer = inputs.container === 'original' ? file.container : inputs.container;
    response.container = `.${targetContainer}`;
  
    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== 'video') {
      response.infoLog += 'File is not a video. \n';
      return response;
    }
  
    let duration = 0;
  
    // Get duration in seconds
    if (parseFloat(file.ffProbeData?.format?.duration) > 0) {
      duration = parseFloat(file.ffProbeData?.format?.duration);
    } else if (typeof file.meta.Duration !== 'undefined') {
      duration = file.meta.Duration;
    } else {
      duration = file.ffProbeData.streams[0].duration;
    }
  
    // Set up required variables.
    let resizeRequired = false;
    let extraArguments = '';
    let genpts = '';
    let rateControlSettings = '';
    let primaryVideoStreamIndex = -1;
    let primaryVideoCodec = '';
    let mappingChanged = false;
    const passthroughStreamIndexes = [];
  
    // Used from here https://blog.frame.io/2017/03/06/calculate-video-bitrates/
  
    const currentBitrate = (file.file_size * 1024 * 1024 * 8) / duration;
    // Use the same calculation used for currentBitrate but divide it in half to get targetBitrate.
    // Logic of h265 can be half the bitrate as h264 without losing quality.
  
    const targetBitrate = currentBitrate * inputs.target_bitrate_multiplier;
    // Allow some leeway under and over the targetBitrate.
  
    const minimumBitrate = (targetBitrate * 0.7);
  
    const maximumBitrate = (targetBitrate * 1.3);
  
    // If Container .ts or .avi set genpts to fix unknown timestamp
    if (targetContainer === 'ts' || targetContainer === 'avi') {
      genpts = '-fflags +genpts';
    }
  
    // If targetBitrate comes out as 0 then something has gone wrong and bitrates could not be calculated.
    // Cancel plugin completely.
    if (targetBitrate === 0) {
      response.infoLog += 'Target bitrate could not be calculated. Skipping this plugin. \n';
      return response;
    }
  
    // Check if inputs.bitrate cutoff has something entered.
    // (Entered means user actually wants something to happen, empty would disable this).
    // Checks if currentBitrate is below inputs.bitrate_cutoff.
    // If so then cancel plugin without touching original files.
    if (currentBitrate <= inputs.bitrate_cutoff) {
      response.infoLog += `Current bitrate is below set cutoff of ${inputs.bitrate_cutoff}. Cancelling plugin. \n`;
      return response;
    }
  
    // Check if force_conform option is checked.
    // If so then check streams and add any extra parameters required to make file conform with output format.
    if (inputs.force_conform === true) {
      if (targetContainer === 'mkv') {
        extraArguments += '-map -0:d ';
        for (let i = 0; i < file.ffProbeData.streams.length; i++) {
          try {
            if (
              file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'mov_text'
              || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'eia_608'
              || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'timed_id3'
            ) {
              extraArguments += `-map -0:${i} `;
            }
          } catch (err) {
            // Error
          }
        }
      }
      if (targetContainer === 'mp4') {
        for (let i = 0; i < file.ffProbeData.streams.length; i++) {
          try {
            if (
              file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'hdmv_pgs_subtitle'
              || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'eia_608'
              || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'subrip'
              || file.ffProbeData.streams[i].codec_name
                .toLowerCase() === 'timed_id3'
            ) {
              extraArguments += `-map -0:${i} `;
            }
          } catch (err) {
            // Error
          }
        }
      }
    }
  
    // Check if 10bit variable is true.
    if (inputs.enable_10bit === true) {
      // Use scale_cuda when CUDA hwaccel is active (frames live in GPU memory
      // and `-pix_fmt p010le` fails on hwframes); fall back to `-pix_fmt
      // p010le` for software decode paths.
      const { getNvenc10BitFormatArg } = require('../methods/nvdecPreset');
      extraArguments += getNvenc10BitFormatArg(file);
    }
  
    // Check if b frame variable is true.
    if (bframeSupport.includes(encoderProperties.encoder) && inputs.bframes_enabled === true) {
      // If set to true then add b frames argument
      extraArguments += `-bf ${inputs.bframes_value} `;
    }
  
    // Go through each stream in the file.
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
      // Check if stream is a video.
      let codec_type = '';
      try {
        codec_type = file.ffProbeData.streams[i].codec_type.toLowerCase();
      } catch (err) {
        // err
      }

      if (isUnsupportedStream(file.ffProbeData.streams[i])) {
        const codecName = typeof file.ffProbeData.streams[i].codec_name === 'string'
          ? file.ffProbeData.streams[i].codec_name
          : 'unknown';
        response.infoLog += `Dropping stream 0:${i} because FFmpeg cannot handle codec "${codecName}". \n`;
        mappingChanged = true;
        continue;
      }

      if (codec_type === 'video') {
        if (isDisposableVideoStream(file.ffProbeData.streams[i])) {
          response.infoLog += `Dropping stream 0:${i} because embedded image video streams are not preserved. \n`;
          mappingChanged = true;
          continue;
        }

        if (primaryVideoStreamIndex === -1) {
          primaryVideoStreamIndex = i;
          primaryVideoCodec = file.ffProbeData.streams[i].codec_name;
          resizeRequired = streamNeedsResize(file.ffProbeData.streams[i], inputs.target_resolution);
          if (i !== 0) {
            response.infoLog += `Promoting video stream 0:${i} to the first output stream. \n`;
            mappingChanged = true;
          }
          continue;
        }
        response.infoLog += `Dropping stream 0:${i} because only the first supported video stream is preserved. \n`;
        mappingChanged = true;
        continue;
      }

      passthroughStreamIndexes.push(i);
    }

    if (primaryVideoStreamIndex === -1) {
      response.infoLog += 'No supported video stream found. \n';
      return response;
    }

    const mappedStreamIndexes = [primaryVideoStreamIndex, ...passthroughStreamIndexes];
    const streamMapArguments = getStreamMapArguments(mappedStreamIndexes);

    extraArguments = appendVideoFilter(
      extraArguments,
      getResolutionFilter({
        encoder: encoderProperties.encoder,
        targetResolution: inputs.target_resolution,
      }),
    );
  
    const encoderRateControl = getEncoderRateControl({
      encoder: encoderProperties.encoder,
      currentBitrate,
      targetBitrate,
      maximumBitrate,
    });
    rateControlSettings = encoderRateControl.rateControlSettings;
    // Print to infoLog information around file & bitrate settings.
    response.infoLog += `Encoder selected as ${encoderProperties.encoder}. \n`;
    response.infoLog += `Encoder rate control = ${encoderRateControl.description}. \n`;
    response.infoLog += `Container for output selected as ${targetContainer}. \n`;
    response.infoLog += `Resolution target selected as ${inputs.target_resolution}. \n`;
    response.infoLog += `Current bitrate = ${currentBitrate} \n`;
    response.infoLog += 'Bitrate settings: \n';
    response.infoLog += `Target = ${targetBitrate} \n`;
    response.infoLog += `Minimum = ${minimumBitrate} \n`;
    response.infoLog += `Maximum = ${maximumBitrate} \n`;

    if (
      primaryVideoCodec === inputs.target_codec
      && file.container === targetContainer
      && !resizeRequired
      && !mappingChanged
    ) {
      response.infoLog += `File is already ${inputs.target_codec} and in ${targetContainer}. \n`;
      return response;
    }

    if (
      primaryVideoCodec === inputs.target_codec
      && !resizeRequired
    ) {
      response.infoLog += `File video is already ${inputs.target_codec} but `
        + 'stream order/selection or container needs normalization. Remuxing. \n';
      response.preset = `<io> ${streamMapArguments} -c copy ${extraArguments}`;
      response.processFile = true;
      return response;
    }
  
    // Use modern CUDA hwaccel instead of legacy *_cuvid decoders
    // which cause frame-ordering issues (stuttering) with FFmpeg 7+.
    // Helper returns '' for AV1 to keep older GPUs on software decode.
    if (encoderProperties.encoder.includes('nvenc')) {
      const { getNvdecHwaccelPreset } = require('../methods/nvdecPreset');
      response.preset = getNvdecHwaccelPreset(file);
    }
  
    response.preset += ` ${encoderProperties.inputArgs ? encoderProperties.inputArgs : ''} ${genpts}<io>`
      + ` ${streamMapArguments} -c copy -c:v ${encoderProperties.encoder}`
      + ` ${encoderProperties.outputArgs ? encoderProperties.outputArgs : ''}`
      + ` ${rateControlSettings}`
      + ` -max_muxing_queue_size 9999 ${extraArguments}`;
    response.processFile = true;
    response.infoLog += `File is not in ${inputs.target_codec}. Transcoding. \n`;
    return response;
  };
  module.exports.details = details;
  module.exports.plugin = plugin;
  
