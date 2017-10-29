package gui;

import logger.LoggerBase;
import org.apache.log4j.Logger;

import javax.swing.*;

public class ImageContainer extends JPanel {

    protected static final String PROJECT_PATH = System.getProperty("user.dir") + "/";
    protected static final String IMAGE_DIRECTORY = PROJECT_PATH + "src/main/resources/images/";

    protected static Logger log = LoggerBase.log;

    public ImageContainer(String filenameInImages) {

        // Seems that slash (/) and backslash (\) can be used interchangeably
        String imagePath = IMAGE_DIRECTORY + filenameInImages;
        ImageIcon icon = new ImageIcon(imagePath);

        // add hierarchy:
        // JFrame -> JPanel -> JLabel
        JLabel label = new JLabel("", icon, JLabel.CENTER);
        this.add(label);
        log.info("Image loaded");
    }
}
