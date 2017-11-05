package gui;

import exception.ImageNotFoundException;
import logger.LogFactory;
import org.apache.log4j.Logger;

import javax.swing.*;
import java.io.File;

public class ImageContainer extends JPanel {

    protected static final String PROJECT_PATH = System.getProperty("user.dir") + "/";
    protected static final String IMAGE_DIRECTORY = PROJECT_PATH + "src/main/resources/images/";

    protected static Logger log = LogFactory.getLog(ImageContainer.class);

    public ImageContainer(String filenameInImages) {

        // Seems that slash (/) and backslash (\) can be used interchangeably
        String imagePath = IMAGE_DIRECTORY + filenameInImages;
        imagePath = imagePath.replace('\\', '/');
        if (!ValidFileExistense(imagePath)) {
            String errorMsg = "Cant find file '" + imagePath + "' Please check";
            log.error(errorMsg);
            throw new ImageNotFoundException(errorMsg);
        }

        ImageIcon icon = new ImageIcon(imagePath);

        // add hierarchy:
        // JFrame -> JPanel -> JLabel
        JLabel label = new JLabel("", icon, JLabel.CENTER);
        this.add(label);
        log.info("Image loaded");
    }

    private boolean ValidFileExistense(String fullPath) {
        File file = new File(fullPath);
        return file.exists();
    }
}
